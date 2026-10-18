import { Hono } from 'hono';
import { judgeDay } from './streak';
import { sendExpoPush } from './push';
export interface Env { DB: D1Database }
type User = { id: string; name: string; color: string; wake_time: string; tz: string; push_token: string | null; created_at: string };
type Group = { id: string; name: string; invite_code: string; streak: number; best_streak: number; created_at: string };
const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();
const hash = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
function localDate(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year','month','day'].map(k => parts.find(p => p.type === k)!.value).join('-');
}
function validProfile(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80)) return false;
  if (body.wakeTime !== undefined && (typeof body.wakeTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.wakeTime))) return false;
  if (body.pushToken !== undefined && body.pushToken !== null && (typeof body.pushToken !== 'string' || body.pushToken.length > 512)) return false;
  try { if (body.tz !== undefined) { if (typeof body.tz !== 'string') return false; new Intl.DateTimeFormat('en-US', { timeZone: body.tz }); } } catch { return false; }
  return true;
}
app.onError((err, c) => { if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON' }, 400); console.error('Request failed', err.message); return c.json({ error: 'Internal server error' }, 500); });
app.post('/v1/users', async c => {
  const raw = await c.req.text();
  const body: unknown = raw.trim() ? JSON.parse(raw) : {};
  if (!validProfile(body)) return c.json({ error: 'Invalid profile' }, 400);
  const userId = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO users (id,token_hash,name,color,wake_time,tz,created_at) VALUES (?,?,?,?,?,?,?)').bind(userId, await hash(token), body.name ?? 'ピヨ', '#F5C842', body.wakeTime ?? '07:00', body.tz ?? 'Asia/Tokyo', new Date().toISOString()).run();
  return c.json({ userId, token }, 201);
});
app.use('/v1/*', async (c, next) => {
  const token = /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
  const user = token ? await c.env.DB.prepare('SELECT id,name,color,wake_time,tz,created_at FROM users WHERE token_hash=?').bind(await hash(token)).first<User>() : null;
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user); await next();
});
app.patch('/v1/me', async c => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!validProfile(body)) return c.json({ error: 'Invalid profile' }, 400);
  const fields = { name: 'name', wakeTime: 'wake_time', tz: 'tz', pushToken: 'push_token' };
  const keys = (Object.keys(fields) as (keyof typeof fields)[]).filter(k => body[k] !== undefined);
  if (keys.length) await c.env.DB.prepare(`UPDATE users SET ${keys.map(k => `${fields[k]}=?`).join(',')} WHERE id=?`).bind(...keys.map(k => body[k]), c.get('user').id).run();
  return c.json({ ok: true });
});
async function membership(db: D1Database, userId: string) {
  return db.prepare('SELECT g.* FROM groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=?').bind(userId).first<Group>();
}
app.post('/v1/groups', async c => {
  const { name } = await c.req.json<{ name: unknown }>();
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return c.json({ error: 'Invalid name' }, 400);
  const user = c.get('user');
  if (await membership(c.env.DB, user.id)) return c.json({ error: 'Already in a group' }, 409);
  for (let attempt = 0; attempt < 30; attempt++) {
    const id = crypto.randomUUID(), inviteCode = `PIYO-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0')}`, now = new Date().toISOString();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO groups (id,name,invite_code,created_at) VALUES (?,?,?,?)').bind(id, name.trim(), inviteCode, now),
        c.env.DB.prepare('INSERT INTO group_members VALUES (?,?,?)').bind(id, user.id, now),
      ]);
      return c.json({ id, name: name.trim(), inviteCode }, 201);
    } catch (err) {
      if (String(err).includes('groups.invite_code')) continue;
      if (String(err).includes('group_members.user_id')) return c.json({ error: 'Already in a group' }, 409);
      throw err;
    }
  }
  return c.json({ error: 'Invite codes unavailable' }, 503);
});
app.post('/v1/groups/join', async c => {
  const { code } = await c.req.json<{ code: unknown }>();
  if (typeof code !== 'string' || !/^PIYO-\d{4}$/.test(code)) return c.json({ error: 'Invalid code' }, 400);
  const group = await c.env.DB.prepare('SELECT id FROM groups WHERE invite_code=?').bind(code).first<{ id: string }>();
  if (!group) return c.json({ error: 'Group not found' }, 404);
  try {
    await c.env.DB.prepare('INSERT INTO group_members VALUES (?,?,?)').bind(group.id, c.get('user').id, new Date().toISOString()).run();
  } catch (err) {
    if (/group_full|UNIQUE constraint/.test(String(err))) return c.json({ error: 'Group full or already joined' }, 409);
    throw err;
  }
  return c.json({ id: group.id });
});
app.get('/v1/groups/me', async c => {
  const user = c.get('user'), group = await membership(c.env.DB, user.id);
  if (!group) return c.json({ error: 'Group not found' }, 404);
  const now = new Date();
  const { results: members } = await c.env.DB.prepare('SELECT u.id,u.name,u.color,u.wake_time,u.tz FROM users u JOIN group_members m ON m.user_id=u.id WHERE m.group_id=? ORDER BY m.joined_at,u.id').bind(group.id).all<User>();
  const today = await Promise.all(members.map(async member => {
    const check = await c.env.DB.prepare('SELECT checked_at FROM checkins WHERE group_id=? AND user_id=? AND local_date=?').bind(group.id, member.id, localDate(now, member.tz)).first<{ checked_at: string }>();
    return { id: member.id, name: member.name, color: member.color, wakeTime: member.wake_time, tz: member.tz, status: check ? 'awake' : 'sleeping', checkedAt: check?.checked_at };
  }));
  const { results: days } = await c.env.DB.prepare('SELECT local_date,result,late_user_ids FROM day_results WHERE group_id=? ORDER BY local_date DESC LIMIT 7').bind(group.id).all<{ local_date: string; result: string; late_user_ids: string }>();
  return c.json({ group: { id: group.id, name: group.name, inviteCode: group.invite_code }, members: today, localDate: localDate(now, user.tz), streak: group.streak, bestStreak: group.best_streak, week: days.reverse().map(day => day.result === 'kept'), days });
});
app.post('/v1/checkins', async c => {
  const user = c.get('user'), group = await membership(c.env.DB, user.id);
  if (!group) return c.json({ error: 'No group membership' }, 403);
  const now = new Date(), date = localDate(now, user.tz);
  const inserted = await c.env.DB.prepare('INSERT INTO checkins VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(group.id, user.id, date, now.toISOString()).run();
  const check = await c.env.DB.prepare('SELECT checked_at FROM checkins WHERE group_id=? AND user_id=? AND local_date=?').bind(group.id, user.id, date).first<{ checked_at: string }>();
  if (inserted.meta.changes === 1) {
    try {
      const { results: members } = await c.env.DB.prepare('SELECT u.* FROM users u JOIN group_members m ON m.user_id=u.id WHERE m.group_id=?').bind(group.id).all<User>();
      const statuses = await Promise.all(members.map(async member => ({
        member, awake: !!await c.env.DB.prepare('SELECT 1 FROM checkins WHERE group_id=? AND user_id=? AND local_date=?').bind(group.id, member.id, localDate(now, member.tz)).first(),
      })));
      await sendExpoPush(members.filter(member => member.id !== user.id).map(member => ({ to: member.push_token, title: `${user.name}がおきた！`, body: `のこり${statuses.filter(status => !status.awake).length}人。みんなで おきよ〜`, data: { url: '/today' } })));
    } catch { console.error('Checkin notification failed'); }
  }
  return c.json({ groupId: group.id, userId: user.id, localDate: date, checkedAt: check!.checked_at });
});

/** Evaluate each member in their own timezone; group day uses its first member's timezone. */
export async function closeDays(env: Env, now: Date) {
  const { results: groups } = await env.DB.prepare('SELECT * FROM groups ORDER BY created_at,id').all<Group>();
  for (const group of groups) {
    const { results: members } = await env.DB.prepare('SELECT u.*,m.joined_at FROM users u JOIN group_members m ON m.user_id=u.id WHERE m.group_id=? ORDER BY m.joined_at,u.id').bind(group.id).all<User & { joined_at: string }>();
    if (!members.length) continue;
    // Nearest wake occurrence matches the shared pure function, including midnight.
    const occurrence = (member: User, at = now) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: member.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at);
      const val = (key: string) => Number(parts.find(p => p.type === key)!.value);
      const clock = val('hour') * 60 + val('minute') + val('second') / 60;
      const [h,m] = member.wake_time.split(':').map(Number), wake = h * 60 + m;
      const offset = [-1440,0,1440].reduce((best, x) => Math.abs(wake+x-clock) < Math.abs(wake+best-clock) ? x : best);
      return localDate(new Date(at.getTime() + offset * 60000), member.tz);
    };
    const date = occurrence(members[0]);
    if (await env.DB.prepare('SELECT 1 FROM day_results WHERE group_id=? AND local_date=?').bind(group.id,date).first()) continue;
    let pending = false; const late: string[] = [];
    for (const member of members) {
      const memberDate = occurrence(member);
      // Do not retroactively judge a day preceding group creation/membership.
      if (memberDate < localDate(new Date(member.joined_at), member.tz)) { pending = true; break; }
      const checks = await env.DB.prepare('SELECT checked_at FROM checkins WHERE group_id=? AND user_id=? ORDER BY checked_at DESC LIMIT 3').bind(group.id,member.id).all<{ checked_at: string }>();
      const judged = judgeDay([{ id: member.id, wakeTime: member.wake_time, status: 'awake', checkedAt: checks.results.find(check => judgeDay([{ id: member.id, wakeTime: member.wake_time, status: 'awake', checkedAt: check.checked_at }],now,member.tz).result === 'kept')?.checked_at }],now,member.tz);
      if (judged.result === 'pending') pending = true;
      late.push(...judged.late);
    }
    if (pending) {
      try {
        for (const member of members) {
          if (occurrence(member) < localDate(new Date(member.joined_at), member.tz)) continue;
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: member.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
          const val = (key: string) => Number(parts.find(p => p.type === key)!.value);
          const clock = val('hour') * 60 + val('minute') + val('second') / 60 + now.getMilliseconds() / 60000;
          const [h, m] = member.wake_time.split(':').map(Number);
          const delta = [-1440, 0, 1440].map(offset => h * 60 + m + offset - clock).reduce((a,b) => Math.abs(a) <= Math.abs(b) ? a : b);
          const remaining = delta + 30;
          if (remaining < 0 || remaining > 15) continue;
          const { results: checks } = await env.DB.prepare('SELECT checked_at FROM checkins WHERE group_id=? AND user_id=? ORDER BY checked_at DESC LIMIT 3').bind(group.id,member.id).all<{ checked_at: string }>();
          if (checks.some(check => {
            const checked = new Date(check.checked_at);
            return checked <= now && (localDate(checked, member.tz) === occurrence(member) || occurrence(member, checked) === occurrence(member));
          })) continue;
          // Claim before transport: retries/overlapping crons must not duplicate the nudge.
          const claim = await env.DB.prepare('INSERT INTO notification_log (group_id,local_date,kind,user_id,sent_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(group.id,date,'nudge',member.id,now.toISOString()).run();
          if (claim.meta.changes === 1) await sendExpoPush(members.map(recipient => ({ to: recipient.push_token, title: `${member.name}がまだねてる！`, body: 'このままだとストリークが0に…おこしてあげて' })));
        }
      } catch { console.error('Scheduled notification failed'); }
      continue;
    }
    const result = late.length ? 'broken' : 'kept';
    // changes() belongs to the immediately preceding INSERT in this atomic batch.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO day_results VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(group.id,date,result,JSON.stringify(late)),
      env.DB.prepare("UPDATE groups SET best_streak=MAX(best_streak,CASE WHEN ?='kept' THEN streak+1 ELSE 0 END), streak=CASE WHEN ?='kept' THEN streak+1 ELSE 0 END WHERE id=? AND changes()=1").bind(result,result,group.id),
    ]);
  }
}
export default {
  fetch: app.fetch,
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(closeDays(env, new Date(event.scheduledTime))); },
};
