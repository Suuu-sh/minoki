import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as api from '../api/okiyo';
import { GROUP_ALARM_ID, type WakeAlarm } from './alarmTypes';
import { handleWakeFollowupResponse } from './wakeFollowup';

// Android's Expo TaskManager handles action taps without foregrounding. iOS is
// handled by the local Expo module's AppDelegate notification delegate instead.
const WAKE_ACTION_TASK = 'okiyo-wake-followup-action';
if (typeof TaskManager.isTaskDefined === 'function' && !TaskManager.isTaskDefined(WAKE_ACTION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(WAKE_ACTION_TASK, async ({ data, error }) => {
    if (error || !data || !('actionIdentifier' in data)) return;
    await handleWakeFollowupResponse(data as Notifications.NotificationResponse);
  });
}
if (typeof Notifications.registerTaskAsync === 'function') {
  void Notifications.registerTaskAsync(WAKE_ACTION_TASK).catch(() => {});
}

export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// Serialize replacements so rapid changes cannot leave two daily reminders behind.
const REMINDER_ID = 'okiyo-wake-reminder';
const REMINDER_KIND = 'wake-reminder';
const ALARM_NOTIFICATION_PREFIX = 'okiyo-alarm-';
const ALARM_NOTIFICATION_KIND = 'personal-alarm';
let reminderQueue: Promise<unknown> = Promise.resolve();
let reminderSequence = 0;
function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const result = reminderQueue.then(action, action);
  reminderQueue = result.catch(() => {});
  return result;
}
export function cancelWakeReminder(): Promise<void> {
  return enqueue(async () => {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const ids = pending.filter((item) => item.identifier === REMINDER_ID || item.content.data?.kind === REMINDER_KIND).map((item) => item.identifier);
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  });
}
export function scheduleWakeReminder(wakeTime: string): Promise<string | null> {
  return enqueue(async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime)) throw new Error('Invalid wake time');
    if (!(await Notifications.getPermissionsAsync()).granted) return null;
    const [hour, minute] = wakeTime.split(':').map(Number);
    const identifier = `${REMINDER_ID}-${Date.now()}-${++reminderSequence}`;
    const next = await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: 'おきて〜！', body: 'ピヨがおこしてるよ。長押しで起床報告しよう', data: { kind: REMINDER_KIND, url: '/checkin' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const oldIds = pending.filter((item) => item.identifier !== next && (item.identifier === REMINDER_ID || item.content.data?.kind === REMINDER_KIND)).map((item) => item.identifier);
    await Promise.all(oldIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    return next;
  });
}

/** Keep notification fallback schedules isolated per alarm and replace them transactionally. */
export async function reconcileAlarmNotifications(
  alarms: WakeAlarm[],
  alarmKitScheduledIds: Set<string>,
): Promise<Record<string, 'notification' | 'disabled' | 'scheduled' | 'error'>> {
  const result: Record<string, 'notification' | 'disabled' | 'scheduled' | 'error'> = {};
  const permission = await Notifications.getPermissionsAsync().catch(() => ({ granted: false } as const));
  const pending = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);

  for (const alarm of alarms) {
    const prefix = `${ALARM_NOTIFICATION_PREFIX}${encodeURIComponent(alarm.id)}-`;
    const existing = pending.filter((item) => item.identifier.startsWith(prefix));
    if (!alarm.enabled) {
      const failures = await Promise.all(existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).then(() => false).catch(() => true)));
      result[alarm.id] = failures.some(Boolean) ? 'error' : 'disabled';
      continue;
    }

    if (alarmKitScheduledIds.has(alarm.id)) {
      const failures = await Promise.all(existing.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).then(() => false).catch(() => true)));
      result[alarm.id] = failures.some(Boolean) ? 'error' : 'scheduled';
      continue;
    }

    if (!permission.granted) {
      result[alarm.id] = 'error';
      continue;
    }

    const [hour, minute] = alarm.time.split(':').map(Number);
    const days = alarm.weekdays.length === 7 ? [null] : alarm.weekdays;
    // Include the label so an existing fallback with outdated displayed copy is
    // replaced when the user renames an alarm.
    const labelRevision = Array.from(alarm.label).reduce((hash, character) => ((hash * 31) + character.codePointAt(0)!) >>> 0, 7).toString(36);
    const idForDay = (day: number | null) => `${prefix}${alarm.time.replace(':', '')}-${labelRevision}-${day === null ? 'daily' : `weekday-${day}`}`;
    const expectedIds = new Set(days.map(idForDay));
    const currentIds = new Set(existing.map((item) => item.identifier));
    const newlyScheduled: string[] = [];
    let failed = false;
    for (const day of days) {
      const identifier = idForDay(day);
      if (currentIds.has(identifier)) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: alarm.groupLinked ? 'おきて〜！' : alarm.label,
            body: alarm.groupLinked ? 'ピヨがおこしてるよ。アプリで起床を報告しよう' : 'アラームの時間です',
            data: alarm.groupLinked ? { kind: REMINDER_KIND, url: '/checkin' } : { kind: ALARM_NOTIFICATION_KIND, alarmId: alarm.id },
          },
          trigger: day === null
            ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }
            : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: day + 1, hour, minute },
        });
        newlyScheduled.push(identifier);
      } catch { failed = true; break; }
    }

    if (failed) {
      await Promise.all(newlyScheduled.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      result[alarm.id] = 'error';
      continue;
    }

    const stale = existing.filter((item) => !expectedIds.has(item.identifier));
    const failures = await Promise.all(stale.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).then(() => false).catch(() => true)));
    if (failures.some(Boolean)) {
      await Promise.all(newlyScheduled.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      result[alarm.id] = 'error';
      continue;
    }
    result[alarm.id] = 'notification';
  }

  // Remove the pre-multi-alarm generic fallback only when its replacement for
  // the linked group alarm is known to be active.
  const primary = result[GROUP_ALARM_ID];
  if (primary === 'scheduled' || primary === 'notification' || primary === 'disabled') await cancelWakeReminder().catch(() => {});
  return result;
}
export async function registerPushToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!Device.isDevice || Constants.executionEnvironment === ExecutionEnvironment.StoreClient || typeof projectId !== 'string' || !projectId) return null;
  try {
    if (!await requestPermission()) return null;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.updateMe({ pushToken });
    return pushToken;
  } catch { return null; }
}
export function urlFromNotification(response: Notifications.NotificationResponse | null | undefined): string | null {
  const url = response?.notification?.request?.content?.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
