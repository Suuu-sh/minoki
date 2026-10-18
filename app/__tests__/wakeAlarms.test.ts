jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('../modules/okiyo-wake-action/src', () => ({ nativeWakeAction: {
  getWakeAlarmStatus: jest.fn(), requestWakeAlarmAuthorization: jest.fn(),
  reconcileWakeAlarms: jest.fn(),
} }));
jest.mock('../src/lib/notifications', () => ({
  reconcileAlarmNotifications: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { enableWakeAlarmSystem, loadWakeAlarms, saveWakeAlarms, syncWakeAlarms, updateGroupWakeAlarmTime } from '../src/lib/wakeAlarms';
import { GROUP_ALARM_ID, type WakeAlarm } from '../src/lib/alarmTypes';

const secure = jest.mocked(SecureStore);
const native = jest.requireMock('../modules/okiyo-wake-action/src').nativeWakeAction;
const notificationFallback = jest.requireMock('../src/lib/notifications').reconcileAlarmNotifications;
const primary: WakeAlarm = { id: GROUP_ALARM_ID, label: 'みんなの起床', time: '06:30', weekdays: [0, 1, 2, 3, 4, 5, 6], enabled: true, groupLinked: true };
const extra: WakeAlarm = { id: 'alarm-1', label: '朝の準備', time: '07:15', weekdays: [1, 2, 3, 4, 5], enabled: false, groupLinked: false };

beforeEach(() => {
  jest.clearAllMocks();
  secure.getItemAsync.mockResolvedValue(JSON.stringify([primary, extra]));
  secure.setItemAsync.mockResolvedValue(undefined);
  native.getWakeAlarmStatus.mockResolvedValue({ state: 'authorized' });
  native.requestWakeAlarmAuthorization.mockResolvedValue('authorized');
  native.reconcileWakeAlarms.mockResolvedValue({ state: 'scheduled', alarms: [{ id: GROUP_ALARM_ID, state: 'scheduled' }, { id: 'alarm-1', state: 'disabled' }] });
  notificationFallback.mockResolvedValue({ [GROUP_ALARM_ID]: 'scheduled', 'alarm-1': 'disabled' });
});

test('loads and migrates the linked primary to the current group time without re-enabling saved alarms', async () => {
  const alarms = await loadWakeAlarms('06:45');
  expect(alarms).toEqual([{ ...primary, time: '06:45' }, extra]);
  expect(secure.setItemAsync).toHaveBeenLastCalledWith('okiyo-wake-alarms-v1', JSON.stringify([{ ...primary, time: '06:45' }, extra]));
});

test('group time updates the primary only and preserves personal alarms/settings', async () => {
  await updateGroupWakeAlarmTime('07:00');
  expect(native.reconcileWakeAlarms).toHaveBeenCalledWith([{ ...primary, time: '07:00' }, extra]);
  expect(secure.setItemAsync).toHaveBeenCalledWith('okiyo-wake-alarms-v1', JSON.stringify([{ ...primary, time: '07:00' }, extra]));
});

test('reconcile passes disabled/deleted IDs to native and never requests authorization automatically', async () => {
  await syncWakeAlarms([primary, extra]);
  expect(native.requestWakeAlarmAuthorization).not.toHaveBeenCalled();
  expect(native.reconcileWakeAlarms).toHaveBeenCalledWith([primary, extra]);
  expect(notificationFallback).toHaveBeenCalledWith([primary, extra], new Set([GROUP_ALARM_ID]));
});

test('authorization is requested only by the explicit enable action', async () => {
  const result = await enableWakeAlarmSystem([primary, extra]);
  expect(native.requestWakeAlarmAuthorization).toHaveBeenCalledTimes(1);
  expect(result.deliveries[GROUP_ALARM_ID]).toBe('scheduled');
});

test('does not report a disabled alarm as cancelled when native cancellation failed', async () => {
  native.reconcileWakeAlarms.mockResolvedValue({ state: 'error', alarms: [{ id: 'alarm-1', state: 'error' }] });
  notificationFallback.mockResolvedValue({ [GROUP_ALARM_ID]: 'scheduled', 'alarm-1': 'disabled' });
  const result = await syncWakeAlarms([primary, extra]);
  expect(result.deliveries['alarm-1']).toBe('error');
});

test('attempts native cleanup without requesting authorization and keeps the notification fallback', async () => {
  native.getWakeAlarmStatus.mockResolvedValue({ state: 'denied' });
  native.reconcileWakeAlarms.mockResolvedValue({ state: 'denied', alarms: [{ id: GROUP_ALARM_ID, state: 'error' }] });
  notificationFallback.mockResolvedValue({ [GROUP_ALARM_ID]: 'notification', 'alarm-1': 'disabled' });
  const result = await syncWakeAlarms([primary, extra]);
  expect(native.reconcileWakeAlarms).toHaveBeenCalledWith([primary, extra]);
  expect(native.requestWakeAlarmAuthorization).not.toHaveBeenCalled();
  expect(result.authorization).toBe('denied');
  expect(result.deliveries[GROUP_ALARM_ID]).toBe('error');
});

test('rejects deleting the primary or exceeding the supported alarm count', async () => {
  await expect(saveWakeAlarms([extra])).rejects.toThrow();
  await expect(saveWakeAlarms([primary, ...Array.from({ length: 8 }, (_, i) => ({ ...extra, id: `extra-${i}` }))])).rejects.toThrow();
});
