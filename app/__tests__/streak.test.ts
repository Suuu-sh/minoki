import { describe, expect, test } from '@jest/globals';
import { applyResult, isWithinWindow, judgeDay } from '../src/lib/streak';

const date = (time: string) => new Date(time);
const member = (checkedAt = '2026-10-18T07:00:00Z') => ({ id: 'one', status: 'awake', wakeTime: '07:00', checkedAt });

describe('isWithinWindow', () => {
  test.each([
    ['06:30:00.000', true], ['07:30:00.000', true],
    ['06:29:59.999', false], ['07:30:00.001', false],
  ])('inclusive exact boundary %s', (time, expected) => {
    expect(isWithinWindow('07:00', date(`2026-10-18T${time}Z`), 'UTC')).toBe(expected);
  });
  test('midnight circular distance', () => {
    expect(isWithinWindow('23:50', date('2026-10-19T00:20:00Z'), 'UTC')).toBe(true);
    expect(isWithinWindow('23:50', date('2026-10-19T00:20:00.001Z'), 'UTC')).toBe(false);
    expect(isWithinWindow('00:10', date('2026-10-18T23:40:00Z'), 'UTC')).toBe(true);
  });
  test('time zones, custom window and invalid timestamp', () => {
    const checked = date('2026-10-17T22:00:00Z');
    expect(isWithinWindow('07:00', checked, 'Asia/Tokyo')).toBe(true);
    expect(isWithinWindow('07:00', checked, 'UTC')).toBe(false);
    expect(isWithinWindow('07:00', date('2026-10-18T07:01:00Z'), 'UTC', 0)).toBe(false);
    expect(isWithinWindow('07:00', new Date(NaN), 'UTC')).toBe(false);
    expect(() => isWithinWindow('24:00', checked, 'UTC')).toThrow(RangeError);
  });
});

describe('judgeDay', () => {
  test('singleton stays pending through inclusive endpoint', () => {
    expect(judgeDay([member()], date('2026-10-18T07:30:00Z'), 'UTC')).toEqual({ result: 'pending', late: [] });
    expect(judgeDay([member('2026-10-18T07:30:00Z')], date('2026-10-18T07:30:00.001Z'), 'UTC')).toEqual({ result: 'kept', late: [] });
  });
  test('waits for every deadline', () => {
    expect(judgeDay([member(), { ...member(), wakeTime: '08:00' }], date('2026-10-18T07:31:00Z'), 'UTC').result).toBe('pending');
  });
  test.each(['2026-10-17T07:00:00Z', '2026-10-18T07:30:00.001Z', '07:00', 'invalid'])('rejects incorrect date or invalid check-in %s', (checkedAt) => {
    expect(judgeDay([member(checkedAt)], date('2026-10-18T08:00:00Z'), 'UTC')).toEqual({ result: 'broken', late: ['one'] });
  });
  test('sleeping, missing timestamp and ID fallback', () => {
    expect(judgeDay([{ status: 'sleeping', wakeTime: '07:00' }], date('2026-10-18T08:00:00Z'), 'UTC')).toEqual({ result: 'broken', late: ['0'] });
  });
  test('midnight anchors yesterday and tomorrow', () => {
    const m = { ...member('2026-10-19T00:20:00Z'), wakeTime: '23:50' };
    expect(judgeDay([m], date('2026-10-19T00:20:00Z'), 'UTC').result).toBe('pending');
    expect(judgeDay([m], date('2026-10-19T00:21:00Z'), 'UTC').result).toBe('kept');
    expect(judgeDay([{ ...m, wakeTime: '00:10' }], date('2026-10-18T23:50:00Z'), 'UTC').result).toBe('pending');
  });
  test('uses requested local date and time zone', () => {
    expect(judgeDay([member('2026-10-17T22:00:00Z')], date('2026-10-17T23:00:00Z'), 'Asia/Tokyo').result).toBe('kept');
  });
});

test('applyResult preserves inputs, slicing, best and pending', () => {
  const week = Object.freeze([true, false, true]);
  expect(applyResult(4, 4, week, 'kept')).toEqual({ streak: 5, bestStreak: 5, week: [false, true, true] });
  expect(applyResult(4, 8, week, 'broken')).toEqual({ streak: 0, bestStreak: 8, week: [false, true, false] });
  expect(applyResult(4, 8, week, 'pending')).toEqual({ streak: 4, bestStreak: 8, week });
  expect(week).toEqual([true, false, true]);
});
