import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { nativeWakeAction } from '../../modules/okiyo-wake-action/src';
import { canStartWakeFollowupActivity, endWakeFollowupActivities, startWakeFollowupActivity } from './wakeFollowupActivity';

const STORAGE_PREFIX = 'okiyo-wake-followup';
const CATEGORY = 'okiyo_wake_followup';
const ACTION_CONFIRM = 'okiyo_wake_confirm';
const NOTIFICATION_PREFIX = 'okiyo-wake-followup-';
const REMINDER_AT_MIN = 10;
// A missing response is considered unanswered 15 minutes after check-in.
const UNANSWERED_AT_MIN = 15;

export type WakeFollowupStatus = 'pending' | 'confirmed' | 'unconfirmed' | 'skipped';
export type WakeFollowup = {
  id: string;
  userId: string;
  dayKey: string;
  checkedAt: number;
  status: WakeFollowupStatus;
};

const localDayKey = (at = new Date()) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
const storageKey = (userId: string, dayKey: string) =>
  `${STORAGE_PREFIX}-${userId.replace(/[^A-Za-z0-9._-]/g, '_')}-${dayKey}`;

async function readRaw(userId: string, dayKey: string): Promise<WakeFollowup | null> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(userId, dayKey));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WakeFollowup>;
    if (typeof value.id !== 'string' || value.userId !== userId || value.dayKey !== dayKey || typeof value.checkedAt !== 'number' || !['pending', 'confirmed', 'unconfirmed', 'skipped'].includes(value.status ?? '')) return null;
    return value as WakeFollowup;
  } catch { return null; }
}

async function write(value: WakeFollowup): Promise<void> {
  await SecureStore.setItemAsync(storageKey(value.userId, value.dayKey), JSON.stringify(value));
}

export async function getWakeFollowup(userId?: string): Promise<WakeFollowup | null> {
  if (!userId) return null;
  const dayKey = localDayKey();
  const current = await readRaw(userId, dayKey);
  if (!current) return null;

  // The native iOS notification delegate persists an action even when the JS
  // runtime is not started, so read it back when the app next becomes active.
  try {
    if (current.status === 'pending' && nativeWakeAction?.getConfirmedWakeId() === current.id) {
      const confirmed = { ...current, status: 'confirmed' as const };
      await write(confirmed);
      try { nativeWakeAction.clearConfirmedWakeId(); } catch { /* status is already durable in SecureStore */ }
      try { nativeWakeAction.clearPendingWake(current.id); } catch { /* status is already durable in SecureStore */ }
      await cancelFollowupNotifications(current.id);
      await endWakeFollowupActivities();
      return confirmed;
    }
  } catch { /* retain the persisted JS state if native storage is unavailable */ }

  if (current.status === 'pending' && Date.now() >= current.checkedAt + UNANSWERED_AT_MIN * 60_000) {
    const expired = { ...current, status: 'unconfirmed' as const };
    await write(expired);
    try { nativeWakeAction?.clearPendingWake(current.id); } catch { /* best-effort native cleanup */ }
    await endWakeFollowupActivities();
    return expired;
  }
  return current;
}

async function cancelFollowupNotifications(id: string): Promise<void> {
  await Promise.all([5, REMINDER_AT_MIN, UNANSWERED_AT_MIN].map((minute) =>
    Notifications.cancelScheduledNotificationAsync(`${NOTIFICATION_PREFIX}${id}-${minute}`).catch(() => {}),
  ));
}

export async function beginWakeFollowup(userId: string): Promise<WakeFollowup> {
  const now = Date.now();
  const dayKey = localDayKey(new Date(now));
  const id = String(now);
  const previous = await readRaw(userId, dayKey);
  if (previous) {
    await cancelFollowupNotifications(previous.id);
    try { nativeWakeAction?.clearPendingWake(previous.id); } catch { /* native module may be unavailable */ }
    await endWakeFollowupActivities();
  }
  const allowed = await Notifications.getPermissionsAsync().then((permissions) => permissions.granted).catch(() => false);
  let activityStarted = false;
  const activityAvailable = canStartWakeFollowupActivity() && !!nativeWakeAction?.areLiveActivitiesEnabled();
  const followup: WakeFollowup = { id, userId, dayKey, checkedAt: now, status: allowed || activityAvailable ? 'pending' : 'skipped' };
  await write(followup);
  if (followup.status === 'skipped') return followup;

  if (activityAvailable) {
    try {
      nativeWakeAction?.setPendingWake(id, now);
      activityStarted = startWakeFollowupActivity(id, now);
    } catch { activityStarted = false; }
  }

  if (!allowed) {
    if (activityStarted) return followup;
    const skipped = { ...followup, status: 'skipped' as const };
    await write(skipped);
    try { nativeWakeAction?.clearPendingWake(id); } catch { /* best-effort native cleanup */ }
    return skipped;
  }

  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY, [{
      identifier: ACTION_CONFIRM,
      buttonTitle: 'Yes、起きてる！',
      options: { opensAppToForeground: false },
    }]);
    const schedule = (minute: number, body: string) => Notifications.scheduleNotificationAsync({
      identifier: `${NOTIFICATION_PREFIX}${id}-${minute}`,
      content: {
        title: '起床後の確認',
        body,
        ...(minute < UNANSWERED_AT_MIN ? { categoryIdentifier: CATEGORY } : {}),
        data: { kind: 'wake-followup', wakeId: id, userId, dayKey, checkedAt: now },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(now + minute * 60_000) },
    });

    await schedule(5, '二度寝してない？🐥');
    await schedule(REMINDER_AT_MIN, '二度寝してない？🐥');
    await schedule(UNANSWERED_AT_MIN, '二度寝確認なし');
  } catch {
    await cancelFollowupNotifications(id);
    if (!activityStarted) {
      const skipped = { ...followup, status: 'skipped' as const };
      await write(skipped);
      try { nativeWakeAction?.clearPendingWake(id); } catch { /* best-effort native cleanup */ }
      return skipped;
    }
  }
  return followup;
}

export async function confirmWakeFollowup(wakeId?: unknown, userId?: unknown, dayKey?: unknown): Promise<WakeFollowup | null> {
  if (typeof wakeId !== 'string' || typeof userId !== 'string' || typeof dayKey !== 'string') return null;
  const current = await readRaw(userId, dayKey);
  if (!current || current.id !== wakeId || current.status !== 'pending') return current;
  if (Date.now() >= current.checkedAt + UNANSWERED_AT_MIN * 60_000) {
    const expired = { ...current, status: 'unconfirmed' as const };
    await write(expired);
    return expired;
  }
  const confirmed = { ...current, status: 'confirmed' as const };
  await write(confirmed);
  try {
    if (nativeWakeAction?.getConfirmedWakeId() === current.id) nativeWakeAction.clearConfirmedWakeId();
    nativeWakeAction?.clearPendingWake(current.id);
  } catch { /* native marker is harmless once SecureStore is confirmed */ }
  await cancelFollowupNotifications(current.id);
  await endWakeFollowupActivities();
  return confirmed;
}

export async function clearWakeFollowup(userId: string): Promise<void> {
  const dayKey = localDayKey();
  const current = await readRaw(userId, dayKey);
  if (current) await cancelFollowupNotifications(current.id);
  if (current) {
    try { nativeWakeAction?.clearPendingWake(current.id); } catch { /* best-effort native cleanup */ }
    await endWakeFollowupActivities();
  }
  await SecureStore.deleteItemAsync(storageKey(userId, dayKey));
}

export function isWakeFollowupAction(response: Notifications.NotificationResponse): boolean {
  return response.actionIdentifier === ACTION_CONFIRM && response.notification.request.content.data?.kind === 'wake-followup';
}

export async function handleWakeFollowupResponse(response: Notifications.NotificationResponse): Promise<WakeFollowup | null> {
  if (!isWakeFollowupAction(response)) return null;
  const data = response.notification.request.content.data;
  return confirmWakeFollowup(data?.wakeId, data?.userId, data?.dayKey);
}
