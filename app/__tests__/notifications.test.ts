import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as api from '../src/api/okiyo';
import { cancelWakeReminder, registerPushToken, scheduleWakeReminder, urlFromNotification } from '../src/lib/notifications';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  scheduleNotificationAsync: jest.fn((request: { identifier?: string }) => Promise.resolve(request.identifier ?? 'reminder')),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project' } } }, executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('../src/api/okiyo', () => ({ updateMe: jest.fn().mockResolvedValue({ ok: true }) }));
beforeEach(() => jest.clearAllMocks());
test('schedules replacement before cancelling older local reminder', async () => {
  const scheduled = await scheduleWakeReminder('06:35');
  expect(scheduled).toMatch(/^okiyo-wake-reminder-/);
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    identifier: scheduled,
    content: { title: 'おきて〜！', body: 'ピヨがおこしてるよ。長押しで起床報告しよう', data: { kind: 'wake-reminder', url: '/checkin' } },
    trigger: { type: 'daily', hour: 6, minute: 35 },
  }));
  await cancelWakeReminder();
  expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled();
});
test('invalid times never schedule', async () => {
  await expect(scheduleWakeReminder('24:00')).rejects.toThrow();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
test('denied permission leaves no replacement', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ granted: false } as Notifications.NotificationPermissionsStatus);
  expect(await scheduleWakeReminder('23:59')).toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
test('registers token with project id and skips Expo Go', async () => {
  expect(await registerPushToken()).toBe('ExponentPushToken[test]');
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project' });
  expect(api.updateMe).toHaveBeenCalledWith({ pushToken: 'ExponentPushToken[test]' });
  Constants.executionEnvironment = 'storeClient' as typeof Constants.executionEnvironment;
  expect(await registerPushToken()).toBeNull();
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
});
test('extracts only internal paths', () => {
  const response = (url: unknown) => ({ notification: { request: { content: { data: { url } } } } }) as unknown as Notifications.NotificationResponse;
  expect(urlFromNotification(response('/checkin'))).toBe('/checkin');
  expect(urlFromNotification(response('https://example.com'))).toBeNull();
  expect(urlFromNotification(response(1))).toBeNull();
  expect(urlFromNotification(null)).toBeNull();
});
