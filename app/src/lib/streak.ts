export type DayResult = 'kept' | 'broken' | 'pending';

export type DayMember = {
  id?: string;
  status: string;
  wakeTime: string;
  /** An absolute timestamp (ISO with Z/offset), not a display-only HH:mm. */
  checkedAt?: string | Date;
};

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function wakeMilliseconds(wakeTime: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime)) {
    throw new RangeError('wakeTime must be HH:mm');
  }
  const [hour, minute] = wakeTime.split(':').map(Number);
  return (hour * 60 + minute) * MINUTE;
}

/** Represent local civil time on a UTC axis, keeping seconds and milliseconds. */
function localTime(date: Date, tz: string): number {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'), date.getUTCMilliseconds());
}

export function isWithinWindow(wakeTime: string, checkedAt: Date, tz: string, windowMin = 30): boolean {
  const wake = wakeMilliseconds(wakeTime);
  if (!Number.isFinite(windowMin) || windowMin < 0) throw new RangeError('Invalid windowMin');
  if (!Number.isFinite(checkedAt.getTime())) return false;
  const clock = ((localTime(checkedAt, tz) % DAY) + DAY) % DAY;
  const difference = Math.abs(clock - wake);
  return Math.min(difference, DAY - difference) <= windowMin * MINUTE;
}

/**
 * With no explicit day argument, each wake is anchored to its nearest local civil
 * occurrence to now (ties choose the earlier one). Thus 23:50 at 00:21 belongs
 * to yesterday, while 00:10 at 23:50 belongs to tomorrow. Call near the group's
 * wake period; historical days require an explicit day API, not this helper.
 * A check-in must belong to that same occurrence, not merely match its clock.
 */
export function judgeDay(members: readonly DayMember[], now: Date, tz: string): { result: DayResult; late: string[] } {
  const current = localTime(now, tz);
  const midnight = Math.floor(current / DAY) * DAY;
  const schedules = members.map((member) => {
    const today = midnight + wakeMilliseconds(member.wakeTime);
    const wake = [today - DAY, today, today + DAY].reduce((nearest, candidate) =>
      Math.abs(candidate - current) < Math.abs(nearest - current) ? candidate : nearest);
    return { member, wake };
  });
  if (schedules.some(({ wake }) => current <= wake + 30 * MINUTE)) return { result: 'pending', late: [] };
  const late = schedules.flatMap(({ member, wake }, index) => {
    const raw = member.checkedAt;
    // Require an explicit offset: local strings and mock HH:mm are ambiguous.
    const checked = raw instanceof Date ? raw : typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? new Date(raw) : new Date(NaN);
    const valid = member.status === 'awake' && Number.isFinite(checked.getTime()) && checked.getTime() <= now.getTime()
      && Math.abs(localTime(checked, tz) - wake) <= 30 * MINUTE;
    return valid ? [] : [member.id ?? String(index)];
  });
  return { result: late.length ? 'broken' : 'kept', late };
}

export function applyResult(streak: number, best: number, week: readonly boolean[], result: DayResult) {
  if (result === 'pending') return { streak, bestStreak: best, week: [...week] };
  const next = result === 'kept' ? streak + 1 : 0;
  return { streak: next, bestStreak: Math.max(best, next), week: [...week.slice(1), result === 'kept'] };
}
