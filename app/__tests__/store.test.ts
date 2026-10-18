jest.mock('../src/lib/wakeAlarms', () => ({ syncStoredWakeAlarms: jest.fn() }));
import { syncStoredWakeAlarms } from '../src/lib/wakeAlarms';
import { afterEach, expect, test } from '@jest/globals';
import { useApp } from '../src/store';

const initial = useApp.getState();
afterEach(() => useApp.setState(initial, true));

test('closeDay remains synchronous status-only demo success', () => {
  useApp.setState({ streak: 18, bestStreak: 18, week: [false, true], members: [{ id: 'one', name: 'one', color: '', wakeTime: '07:00', status: 'awake', checkedAt: '06:24' }] });
  const members = useApp.getState().members;
  expect(useApp.getState().closeDay()).toBe('kept');
  expect(useApp.getState()).toMatchObject({ streak: 19, bestStreak: 19, week: [true, true] });
  expect(useApp.getState().members).toBe(members);
});

test('closeDay resets streak, retains best and only marks sleeping late', () => {
  const members = initial.members.map((m, i) => ({ ...m, status: i === 0 ? 'late' as const : m.status }));
  useApp.setState({ members });
  expect(useApp.getState().closeDay()).toBe('broken');
  expect(useApp.getState()).toMatchObject({ streak: 0, bestStreak: 18, week: [...initial.week.slice(1), false] });
  expect(useApp.getState().members[0]).toBe(members[0]);
  expect(useApp.getState().members.find((m) => m.id === 'm3')?.status).toBe('late');
  expect(members.find((m) => m.id === 'm3')?.status).toBe('sleeping');
});

test('alarm scheduling failures never break demo wake time, create or join actions', async () => {
  const sync = jest.mocked(syncStoredWakeAlarms);
  sync.mockRejectedValue(new Error('native unavailable'));
  expect(() => useApp.getState().setWakeTime('07:45')).not.toThrow();
  expect(useApp.getState().wakeTime).toBe('07:45');
  await expect(useApp.getState().createGroup('test')).resolves.toBeUndefined();
  await expect(useApp.getState().joinGroup('PIYO-1234')).resolves.toBeUndefined();
  expect(useApp.getState()).toMatchObject({ onboarded: true, groupName: 'test', inviteCode: 'PIYO-1234', error: null });
  useApp.getState().setWakeTime('08:00');
  await expect(useApp.getState().createGroup('next')).resolves.toBeUndefined();
  await expect(useApp.getState().joinGroup('PIYO-5678')).resolves.toBeUndefined();
  expect(sync).toHaveBeenCalledWith('08:00');
});
