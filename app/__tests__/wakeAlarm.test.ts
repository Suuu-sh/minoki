jest.mock('../modules/okiyo-wake-action/src', () => ({ nativeWakeAction: {
  getWakeAlarmStatus: jest.fn(), requestWakeAlarmAuthorization: jest.fn(), scheduleWakeAlarm: jest.fn(),
  stopRingingWakeAlarm: jest.fn(), consumeWakeAlarmStopIntent: jest.fn(),
} }));
jest.mock('../src/lib/notifications', () => ({
  scheduleWakeReminder: jest.fn(),
  cancelWakeReminder: jest.fn(),
}));

import { enableWakeAlarm, syncWakeAlarm } from '../src/lib/wakeAlarm';
const mockNativeWakeAction = jest.requireMock('../modules/okiyo-wake-action/src').nativeWakeAction;
const { scheduleWakeReminder: mockScheduleWakeReminder, cancelWakeReminder: mockCancelWakeReminder } = jest.requireMock('../src/lib/notifications');

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeWakeAction.getWakeAlarmStatus.mockResolvedValue({ state: 'notDetermined' });
  mockNativeWakeAction.requestWakeAlarmAuthorization.mockResolvedValue('authorized');
  mockNativeWakeAction.scheduleWakeAlarm.mockResolvedValue({ state: 'scheduled', wakeTime: '06:30' });
  mockScheduleWakeReminder.mockResolvedValue('fallback');
  mockCancelWakeReminder.mockResolvedValue(undefined);
});

test('hydration does not request authorization and retains notification fallback', async () => {
  expect(await syncWakeAlarm('06:30')).toEqual({ state: 'notDetermined' });
  expect(mockNativeWakeAction.requestWakeAlarmAuthorization).not.toHaveBeenCalled();
  expect(mockNativeWakeAction.scheduleWakeAlarm).not.toHaveBeenCalled();
  expect(mockScheduleWakeReminder).toHaveBeenCalledWith('06:30');
  expect(mockCancelWakeReminder).not.toHaveBeenCalled();
});

test('native scheduling failure leaves daily notification fallback in place', async () => {
  mockNativeWakeAction.getWakeAlarmStatus.mockResolvedValue({ state: 'authorized' });
  mockNativeWakeAction.scheduleWakeAlarm.mockResolvedValue({ state: 'error' });

  expect(await syncWakeAlarm('07:15')).toEqual({ state: 'error' });
  expect(mockScheduleWakeReminder).toHaveBeenCalledWith('07:15');
  expect(mockCancelWakeReminder).not.toHaveBeenCalled();
});

test('explicit opt-in requests authorization then schedules the current time', async () => {
  mockNativeWakeAction.getWakeAlarmStatus.mockResolvedValue({ state: 'authorized' });
  mockNativeWakeAction.scheduleWakeAlarm.mockResolvedValue({ state: 'scheduled', wakeTime: '06:45' });

  expect(await enableWakeAlarm('06:45')).toEqual({ state: 'scheduled', wakeTime: '06:45' });
  expect(mockNativeWakeAction.requestWakeAlarmAuthorization).toHaveBeenCalledTimes(1);
  expect(mockNativeWakeAction.scheduleWakeAlarm).toHaveBeenCalledWith('06:45');
  expect(mockCancelWakeReminder).toHaveBeenCalledTimes(1);
});
