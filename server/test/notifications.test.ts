import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import worker, { closeDays } from '../src/index';
import { sendExpoPush } from '../src/push';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch(['DELETE FROM notification_log', 'DELETE FROM checkins', 'DELETE FROM day_results', 'DELETE FROM group_members', 'DELETE FROM groups', 'DELETE FROM users'].map(sql => env.DB.prepare(sql)));
});
afterEach(() => vi.unstubAllGlobals());
async function request(path: string, token?: string, body: unknown = {}, method = 'POST') {
  return worker.fetch(new Request('https://test/v1/' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
  }), env, {} as ExecutionContext);
}
async function setup() {
  const people = [];
  for (let i = 0; i < 3; i++) {
    const person = await (await request('users', undefined, { name: 'Member' + i, tz: 'UTC', wakeTime: '07:00' })).json() as { userId: string; token: string };
    people.push(person);
    if (i < 2) await request('me', person.token, { pushToken: 'ExponentPushToken[' + i + ']' }, 'PATCH');
  }
  const group = await (await request('groups', people[0].token, { name: 'Team' })).json() as { id: string; inviteCode: string };
  for (const person of people.slice(1)) await request('groups/join', person.token, { code: group.inviteCode });
  return { people, group };
}
function mockPush() {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [{ status: 'ok' }] })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('notifies only other registered members on first checkin, excluding missing tokens', async () => {
  const { people } = await setup();
  const fetch = mockPush();
  expect((await request('checkins', people[0].token)).status).toBe(200);
  expect((await request('checkins', people[0].token)).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://exp.host/--/api/v2/push/send');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([{
    to: 'ExponentPushToken[1]', title: 'Member0がおきた！', body: 'のこり2人。みんなで おきよ〜', sound: 'default', data: { url: '/today' },
  }]);
});
it('keeps checkin successful when push transport fails', async () => {
  const { people } = await setup();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect((await request('checkins', people[0].token)).status).toBe(200);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM checkins').first('n')).toBe(1);
});
it('nudges all token holders once per sleeper across cron runs', async () => {
  const { people, group } = await setup();
  for (const person of people.slice(0,2)) await env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?)').bind(group.id,person.userId,'2030-01-01','2030-01-01T07:00:00Z').run();
  const fetch = mockPush();
  await closeDays(env,new Date('2030-01-01T07:14:59Z'));
  expect(fetch).not.toHaveBeenCalled();
  await closeDays(env,new Date('2030-01-01T07:15:00Z'));
  await closeDays(env,new Date('2030-01-01T07:20:00Z'));
  expect(fetch).toHaveBeenCalledTimes(1);
  const messages = JSON.parse(fetch.mock.calls[0][1].body);
  expect(messages.map((message: { to: string }) => message.to)).toEqual(expect.arrayContaining(['ExponentPushToken[0]', 'ExponentPushToken[1]']));
  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatchObject({ title: 'Member2がまだねてる！', body: 'このままだとストリークが0に…おこしてあげて' });
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM notification_log').first('n')).toBe(1);
});
it('chunks at 100 and ignores null tokens', async () => {
  const fetch = mockPush();
  await sendExpoPush([...Array.from({ length: 101 },(_,i) => ({ to: 'token' + i, title: 'title', body: 'body' })), { to: null, title: 'title', body: 'body' }]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toHaveLength(100);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toHaveLength(1);
});

it('anchors midnight nudges to the wake date and recognizes post-midnight checkins', async () => {
  const { people, group } = await setup();
  await env.DB.prepare("UPDATE users SET wake_time='23:50'").run();
  for (const person of people.slice(0,2)) await env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?)').bind(group.id,person.userId,'2030-01-02','2030-01-02T00:04:00Z').run();
  const fetch = mockPush();
  await closeDays(env,new Date('2030-01-02T00:05:00Z'));
  await closeDays(env,new Date('2030-01-02T00:10:00Z'));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await env.DB.prepare('SELECT local_date,user_id FROM notification_log').first()).toEqual({ local_date: '2030-01-01', user_id: people[2].userId });
});
it('logs HTTP and Expo ticket errors without throwing', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ status: 'error' }] })));
  vi.stubGlobal('fetch', fetch);
  try {
    await sendExpoPush([{ to: 'token', title: 'title', body: 'body' }]);
    await sendExpoPush([{ to: 'token', title: 'title', body: 'body' }]);
    expect(log).toHaveBeenCalledTimes(2);
  } finally { log.mockRestore(); }
});

it('does not nudge a member with an early out-of-window checkin', async () => {
  const { people, group } = await setup();
  for (const person of people) await env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?)').bind(group.id,person.userId,'2030-01-01','2030-01-01T05:00:00Z').run();
  const fetch = mockPush();
  await closeDays(env,new Date('2030-01-01T07:15:00Z'));
  expect(fetch).not.toHaveBeenCalled();
});
