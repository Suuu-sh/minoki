import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { beginWakeFollowup, confirmWakeFollowup, getWakeFollowup, handleWakeFollowupResponse } from '../src/lib/wakeFollowup';

jest.mock('../src/lib/wakeFollowupActivity', () => ({
  canStartWakeFollowupActivity: jest.fn(() => false),
  startWakeFollowupActivity: jest.fn(() => false),
  endWakeFollowupActivities: jest.fn(async () => {}),
}));

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue({}),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const saved = new Map<string, string>();
beforeEach(() => {
  jest.clearAllMocks();
  saved.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => saved.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { saved.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { saved.delete(key); });
});
afterEach(() => jest.restoreAllMocks());

test('wake starts a persisted pending followup and schedules the prompt, one reminder, then unanswered status', async () => {
  const result = await beginWakeFollowup('user-1');
  expect(result.status).toBe('pending');
  expect(jest.mocked(Notifications.scheduleNotificationAsync)).toHaveBeenCalledTimes(3);
  const requests = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map(([request]) => request);
  expect(requests.map((request) => request.content.body)).toEqual([
    '二度寝してない？🐥', '二度寝してない？🐥', '二度寝確認なし',
  ]);
  expect(requests.slice(0, 2).map((request) => request.content.categoryIdentifier)).toEqual([
    'okiyo_wake_followup', 'okiyo_wake_followup',
  ]);
  expect(requests[2].content.categoryIdentifier).toBeUndefined();
  expect(requests.map((request) => new Date((request.trigger as Notifications.DateTriggerInput).date).getTime() - result.checkedAt)).toEqual([
    5 * 60_000, 10 * 60_000, 15 * 60_000,
  ]);
  expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('okiyo_wake_followup', [expect.objectContaining({
    buttonTitle: 'Yes、起きてる！', options: { opensAppToForeground: false },
  })]);
});

test('confirmation cancels only this wake followup; missed deadline remains distinct from asleep', async () => {
  const followup = await beginWakeFollowup('user-1');
  expect(await confirmWakeFollowup(followup.id, followup.userId, followup.dayKey)).toMatchObject({ status: 'confirmed' });
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
  expect(await getWakeFollowup('user-1')).toMatchObject({ status: 'confirmed' });
  expect(await getWakeFollowup('other-user')).toBeNull();

  const pending = { ...followup, id: 'old', checkedAt: Date.now() - 16 * 60_000, status: 'pending' };
  saved.set(jest.mocked(SecureStore.setItemAsync).mock.calls[0][0], JSON.stringify(pending));
  expect(await getWakeFollowup('user-1')).toMatchObject({ status: 'unconfirmed' });
});

test('background action confirms only the matching wake id', async () => {
  const followup = await beginWakeFollowup('user-1');
  const response = {
    actionIdentifier: 'okiyo_wake_confirm',
    notification: { request: { content: { data: { kind: 'wake-followup', wakeId: followup.id, userId: followup.userId, dayKey: followup.dayKey } } } },
  } as unknown as Notifications.NotificationResponse;
  expect(await handleWakeFollowupResponse(response)).toMatchObject({ status: 'confirmed' });
});

test('disabled notification permission is skipped and never becomes an unanswered response', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ granted: false } as Notifications.NotificationPermissionsStatus);
  const followup = await beginWakeFollowup('user-1');
  expect(followup.status).toBe('skipped');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(await getWakeFollowup('user-1')).toMatchObject({ status: 'skipped' });
});

test('a pending followup with no response is unconfirmed at fifteen minutes', async () => {
  const followup = await beginWakeFollowup('user-1');
  jest.spyOn(Date, 'now').mockReturnValue(followup.checkedAt + 16 * 60_000);
  expect(await getWakeFollowup('user-1')).toMatchObject({ status: 'unconfirmed' });
});
