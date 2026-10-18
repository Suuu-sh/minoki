import { nativeWakeAction } from '../../modules/okiyo-wake-action/src';
import { cancelWakeReminder, scheduleWakeReminder } from './notifications';

export type WakeAlarmState = 'unsupported' | 'notDetermined' | 'denied' | 'authorized' | 'scheduled' | 'error';
export type WakeAlarmStatus = { state: WakeAlarmState; wakeTime?: string };

let queue: Promise<unknown> = Promise.resolve();
let latestWakeTime: string | null = null;
async function scheduleFallback(wakeTime: string): Promise<string | null> {
  try { return await scheduleWakeReminder(wakeTime); }
  catch { return null; }
}
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const task = queue.then(operation, operation);
  queue = task.catch(() => {});
  return task;
}

export async function getWakeAlarmStatus(): Promise<WakeAlarmStatus> {
  if (!nativeWakeAction) return { state: 'unsupported' };
  try { return await nativeWakeAction.getWakeAlarmStatus(); }
  catch { return { state: 'error' }; }
}

async function reconcile(wakeTime: string): Promise<WakeAlarmStatus> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(wakeTime)) return { state: 'error' };
  if (!nativeWakeAction) {
    await scheduleFallback(wakeTime);
    return { state: 'unsupported' };
  }
  const before = await getWakeAlarmStatus();
  if (before.state === 'authorized' || before.state === 'scheduled') {
    const result = await nativeWakeAction.scheduleWakeAlarm(wakeTime).catch(() => ({ state: 'error' as const }));
    if (result.state === 'scheduled') {
      await cancelWakeReminder().catch(() => {});
      return result;
    }
    // AlarmKit scheduling errors must never remove the working notification fallback.
    await scheduleFallback(wakeTime);
    return result;
  }
  await scheduleFallback(wakeTime);
  return before;
}

export function syncWakeAlarm(wakeTime: string): Promise<WakeAlarmStatus> {
  latestWakeTime = wakeTime;
  return serialize(async () => {
    let result = await reconcile(wakeTime);
    // Requests are serialized. If an older operation finished after a newer
    // preference was entered, immediately apply the newest value before return.
    const newest = latestWakeTime;
    if (newest && newest !== wakeTime) result = await reconcile(newest);
    return result;
  });
}

export function enableWakeAlarm(wakeTime: string): Promise<WakeAlarmStatus> {
  latestWakeTime = wakeTime;
  return serialize(async () => {
    if (!nativeWakeAction) return reconcile(wakeTime);
    const permission = await nativeWakeAction.requestWakeAlarmAuthorization().catch(() => 'error' as const);
    const newest = latestWakeTime ?? wakeTime;
    if (permission === 'authorized') return reconcile(newest);
    await scheduleFallback(newest);
    return { state: permission };
  });
}

export async function stopRingingWakeAlarm(): Promise<void> {
  await nativeWakeAction?.stopRingingWakeAlarm().catch(() => {});
}

export function consumeWakeAlarmStopIntent(): boolean {
  try { return nativeWakeAction?.consumeWakeAlarmStopIntent() ?? false; }
  catch { return false; }
}
