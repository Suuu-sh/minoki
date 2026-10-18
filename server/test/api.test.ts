import { beforeEach, describe, expect, it } from 'vitest';
import { env, SELF, applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { closeDays } from '../src/index';
declare global { namespace Cloudflare { interface Env { DB: D1Database; TEST_MIGRATIONS: D1Migration[] } } }
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch(['DELETE FROM checkins','DELETE FROM day_results','DELETE FROM group_members','DELETE FROM groups','DELETE FROM users'].map(sql => env.DB.prepare(sql)));
});
async function request(path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  return SELF.fetch(`https://test/v1/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function user(tz = 'UTC') {
  const response = await request('users', undefined, { name: 'Test', wakeTime: '07:00', tz });
  expect(response.status).toBe(201);
  return response.json<{ userId: string; token: string }>();
}
async function group(token: string) {
  const response = await request('groups',token,{ name: 'Team' });
  expect(response.status).toBe(201);
  return response.json<{ id: string; inviteCode: string }>();
}
describe('authenticated D1 API', () => {
  it('creates a user without a body and rejects invalid profile bodies', async () => {
    const empty = await SELF.fetch('https://test/v1/users', { method:'POST' });
    expect(empty.status).toBe(201);
    expect(await empty.json()).toEqual({ userId:expect.any(String),token:expect.any(String) });
    for (const body of [null, [], 'profile', 42]) {
      expect((await request('users',undefined,body)).status).toBe(400);
    }
    expect((await SELF.fetch('https://test/v1/users',{ method:'POST',body:'{broken' })).status).toBe(400);
    const a = await user();
    expect((await request('me',a.token,null,'PATCH')).status).toBe(400);
  });
  it('rejects absent/invalid credentials and keeps token hashes only', async () => {
    expect((await request('groups/me')).status).toBe(401);
    expect((await request('groups/me','bad')).status).toBe(401);
    const a = await user();
    const stored = await env.DB.prepare('SELECT token_hash FROM users WHERE id=?').bind(a.userId).first<{ token_hash: string }>();
    expect(stored!.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored!.token_hash).not.toBe(a.token);
  });
  it('isolates membership reads and writes, ignoring supplied group IDs', async () => {
    const a = await user(), b = await user(); const ga = await group(a.token);
    expect((await request('groups/me',b.token)).status).toBe(404);
    expect((await request('checkins',b.token,{ groupId: ga.id })).status).toBe(403);
    const gb = await group(b.token);
    const own = await (await request('groups/me',b.token)).json<{ group: { id: string }; members: { id: string }[] }>();
    expect(own.group.id).toBe(gb.id); expect(own.members.map(m => m.id)).toEqual([b.userId]);
    expect((await request(`groups/${ga.id}`,b.token)).status).toBe(404);
    const check = await (await request('checkins',b.token,{ groupId: ga.id })).json<{ groupId: string }>();
    expect(check.groupId).toBe(gb.id);
  });
  it('creates PIYO codes and atomically limits a group to six', async () => {
    const owner = await user(); const g = await group(owner.token);
    expect(g.inviteCode).toMatch(/^PIYO-\d{4}$/);
    const people = await Promise.all(Array.from({ length: 6 }, () => user()));
    const responses = await Promise.all(people.map(person => request('groups/join',person.token,{ code: g.inviteCode })));
    expect(responses.map(r => r.status).sort()).toEqual([200,200,200,200,200,409]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id=?').bind(g.id).first('n')).toBe(6);
  });
  it('uses server timestamp and the authenticated user timezone; retry preserves first checkin', async () => {
    const a = await user('Pacific/Kiritimati'); await group(a.token);
    const start = Date.now();
    const check = await (await request('checkins',a.token,{ checkedAt: '2000-01-01T00:00:00Z', localDate: '2000-01-01' })).json<{ checkedAt: string; localDate: string }>();
    expect(Date.parse(check.checkedAt)).toBeGreaterThanOrEqual(start);
    expect(Date.parse(check.checkedAt)).toBeLessThanOrEqual(Date.now());
    const p = new Intl.DateTimeFormat('en-US',{ timeZone: 'Pacific/Kiritimati',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(check.checkedAt));
    expect(check.localDate).toBe(['year','month','day'].map(k => p.find(x => x.type === k)!.value).join('-'));
    expect(await (await request('checkins',a.token,{})).json()).toEqual(expect.objectContaining({ checkedAt: check.checkedAt }));
  });
});
describe('closeDays real D1 finalization', () => {
  async function seed(checked?: string) {
    const a = await user(); const g = await group(a.token);
    if (checked) await env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?)').bind(g.id,a.userId,'2030-01-01',checked).run();
    return { a, g };
  }
  it('keeps a timely group and is idempotent even for concurrent finalizers', async () => {
    const { g } = await seed('2030-01-01T07:00:00Z');
    await Promise.all([closeDays(env,new Date('2030-01-01T07:31:00Z')),closeDays(env,new Date('2030-01-01T07:31:00Z'))]);
    await closeDays(env,new Date('2030-01-01T07:40:00Z'));
    expect(await env.DB.prepare('SELECT result FROM day_results WHERE group_id=?').bind(g.id).first('result')).toBe('kept');
    expect(await env.DB.prepare('SELECT streak,best_streak FROM groups WHERE id=?').bind(g.id).first()).toEqual({ streak: 1, best_streak: 1 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM day_results').first('n')).toBe(1);
  });
  it('breaks a missing checkin and records late IDs once', async () => {
    const { a,g } = await seed();
    await env.DB.prepare('UPDATE groups SET streak=3,best_streak=4 WHERE id=?').bind(g.id).run();
    await closeDays(env,new Date('2030-01-01T07:31:00Z')); await closeDays(env,new Date('2030-01-01T07:31:00Z'));
    expect(await env.DB.prepare('SELECT result,late_user_ids FROM day_results').first()).toEqual({ result: 'broken',late_user_ids: JSON.stringify([a.userId]) });
    expect(await env.DB.prepare('SELECT streak,best_streak FROM groups').first()).toEqual({ streak:0,best_streak:4 });
  });
  it('anchors a midnight-crossing window to the previous wake date', async () => {
    const { a,g } = await seed();
    await env.DB.prepare('UPDATE users SET wake_time=? WHERE id=?').bind('23:50',a.userId).run();
    await env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?)').bind(g.id,a.userId,'2030-01-02','2030-01-02T00:10:00Z').run();
    await closeDays(env,new Date('2030-01-02T00:21:00Z'));
    expect(await env.DB.prepare('SELECT local_date,result FROM day_results').first()).toEqual({ local_date:'2030-01-01',result:'kept' });
  });
  it('waits for every member in their own timezone', async () => {
    const { a,g } = await seed('2030-01-01T07:00:00Z');
    const b = await user('America/New_York');
    await request('groups/join',b.token,{ code:g.inviteCode });
    await closeDays(env,new Date('2030-01-01T07:31:00Z'));
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM day_results').first('n')).toBe(0);
    await env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?)').bind(g.id,b.userId,'2030-01-01','2030-01-01T12:00:00Z').run();
    await closeDays(env,new Date('2030-01-01T12:31:00Z'));
    expect(await env.DB.prepare('SELECT result FROM day_results').first('result')).toBe('kept');
  });
  it('leaves exact window end pending', async () => {
    await seed('2030-01-01T07:00:00Z'); await closeDays(env,new Date('2030-01-01T07:30:00Z'));
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM day_results').first('n')).toBe(0);
  });
});
