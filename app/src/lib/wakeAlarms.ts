import * as SecureStore from 'expo-secure-store';
import { nativeWakeAction } from '../../modules/okiyo-wake-action/src';
import { reconcileAlarmNotifications } from './notifications';
import { ALL_WEEKDAYS, GROUP_ALARM_ID, isValidWakeTime, isValidWeekdays, MAX_WAKE_ALARMS, type WakeAlarm, type WakeAlarmsSync } from './alarmTypes';

const STORAGE_KEY = 'okiyo-wake-alarms-v1';
type NativeAlarmStatus = { id: string; state: 'scheduled' | 'error' | 'disabled' };
type NativeWakeAlarmModule = NonNullable<typeof nativeWakeAction> & {
  reconcileWakeAlarms: (alarms: Array<Pick<WakeAlarm, 'id' | 'label' | 'time' | 'weekdays' | 'enabled' | 'groupLinked'>>) => Promise<{ state: WakeAlarmsSync['authorization']; alarms?: NativeAlarmStatus[] }>;
};

const asModule = () => nativeWakeAction as NativeWakeAlarmModule | null;
let latest: WakeAlarm[] | null = null;
let queue: Promise<unknown> = Promise.resolve();
let latestGroupTime = '06:30';

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}

function cleanAlarm(value: unknown): WakeAlarm | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<WakeAlarm>;
  if (typeof item.id !== 'string' || !item.id || typeof item.label !== 'string' || !item.label.trim() || !isValidWakeTime(item.time ?? '') || !isValidWeekdays(item.weekdays) || !item.weekdays.length || typeof item.enabled !== 'boolean' || typeof item.groupLinked !== 'boolean') return null;
  return { id: item.id, label: item.label.trim().slice(0, 32), time: item.time!, weekdays: [...new Set(item.weekdays)].sort(), enabled: item.enabled, groupLinked: item.groupLinked };
}

const primaryAlarm = (time: string): WakeAlarm => ({ id: GROUP_ALARM_ID, label: 'みんなの起床', time, weekdays: [...ALL_WEEKDAYS], enabled: true, groupLinked: true });

export async function loadWakeAlarms(groupWakeTime: string): Promise<WakeAlarm[]> {
  latestGroupTime = groupWakeTime;
  return serialize(async () => {
    let alarms: WakeAlarm[] = [];
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) alarms = parsed.map(cleanAlarm).filter((item): item is WakeAlarm => item !== null);
    } catch { /* use safe primary default and persist it below */ }
    if (!alarms.length) alarms = [primaryAlarm(latestGroupTime)];

    const primary = alarms.find((alarm) => alarm.id === GROUP_ALARM_ID && alarm.groupLinked);
    if (!primary) alarms.unshift(primaryAlarm(latestGroupTime));
    else if (primary.time !== latestGroupTime) primary.time = latestGroupTime;

    // Guarantee exactly one group-linked alarm, keep user-created alarms intact.
    const unique = new Map<string, WakeAlarm>();
    for (const alarm of alarms) {
      if (alarm.id === GROUP_ALARM_ID && !alarm.groupLinked) continue;
      if (!unique.has(alarm.id)) unique.set(alarm.id, alarm);
    }
    const normalized = [...unique.values()].slice(0, MAX_WAKE_ALARMS);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(normalized));
    latest = normalized;
    return normalized;
  });
}

export async function saveWakeAlarms(alarms: WakeAlarm[]): Promise<WakeAlarm[]> {
  return serialize(async () => {
    const normalized = alarms.map(cleanAlarm).filter((item): item is WakeAlarm => item !== null);
    if (normalized.length === 0 || normalized.length > MAX_WAKE_ALARMS || normalized.filter((alarm) => alarm.id === GROUP_ALARM_ID && alarm.groupLinked).length !== 1) {
      throw new Error('アラームの内容を確認してください');
    }
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(normalized));
    latest = normalized;
    return normalized;
  });
}

async function reconcile(alarms: WakeAlarm[]): Promise<WakeAlarmsSync> {
  const enabled = alarms.filter((alarm) => alarm.enabled);
  const module = asModule();
  const authorization = module
    ? await module.getWakeAlarmStatus().then((status) => status.state).catch(() => 'error' as const)
    : 'unsupported';

  let nativeResult: { state: WakeAlarmsSync['authorization']; alarms?: NativeAlarmStatus[] } = { state: authorization, alarms: [] };
  // Reconcile even while authorization is unavailable so disabled/deleted
  // native IDs still receive a cancellation attempt; enabled alarms can use
  // the notification fallback when AlarmKit cannot accept their schedule.
  if (module) {
    nativeResult = await module.reconcileWakeAlarms(alarms).catch(() => ({ state: 'error' as const, alarms: [] }));
  }
  const scheduled = new Set((nativeResult.alarms ?? []).filter((item) => item.state === 'scheduled').map((item) => item.id));
  const fallback = await reconcileAlarmNotifications(alarms, scheduled);
  const deliveries: Record<string, WakeAlarmsSync['deliveries'][string]> = {};
  const nativeDeliveries = new Map((nativeResult.alarms ?? []).map((item) => [item.id, item.state]));
  for (const alarm of alarms) {
    if (!alarm.enabled) deliveries[alarm.id] = nativeDeliveries.get(alarm.id) === 'error' || fallback[alarm.id] === 'error' ? 'error' : 'disabled';
    else if (nativeDeliveries.get(alarm.id) === 'error') deliveries[alarm.id] = 'error';
    else if (scheduled.has(alarm.id)) deliveries[alarm.id] = 'scheduled';
    else if (fallback[alarm.id] === 'notification') deliveries[alarm.id] = 'notification';
    else if (fallback[alarm.id] === 'error') deliveries[alarm.id] = 'error';
    else deliveries[alarm.id] = nativeResult.state;
  }
  const currentAuthorization = authorization === 'authorized' || authorization === 'scheduled' ? nativeResult.state : authorization;
  return { authorization: currentAuthorization, deliveries };
}

export function syncWakeAlarms(alarms: WakeAlarm[]): Promise<WakeAlarmsSync> {
  latest = alarms;
  return serialize(async () => {
    const target = latest ?? alarms;
    let result = await reconcile(target);
    const newest = latest;
    if (newest && newest !== target) result = await reconcile(newest);
    return result;
  });
}

export function syncStoredWakeAlarms(groupWakeTime: string): Promise<WakeAlarmsSync> {
  latestGroupTime = groupWakeTime;
  return serialize(async () => {
    const alarms = normalizeGroupAlarm((await readStoredWithoutQueue()) ?? [], latestGroupTime);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(alarms));
    latest = alarms;
    return reconcile(alarms);
  });
}

async function readStoredWithoutQueue(): Promise<WakeAlarm[] | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return null;
    const items = parsed.map(cleanAlarm).filter((item): item is WakeAlarm => item !== null);
    return items.length ? items : null;
  } catch { return null; }
}

function normalizeGroupAlarm(alarms: WakeAlarm[], groupTime: string): WakeAlarm[] {
  const normalized = alarms.length ? [...alarms] : [primaryAlarm(groupTime)];
  let primary = normalized.find((alarm) => alarm.id === GROUP_ALARM_ID && alarm.groupLinked);
  if (!primary) {
    primary = primaryAlarm(groupTime);
    normalized.unshift(primary);
  } else {
    primary.time = groupTime;
  }
  const unique = new Map<string, WakeAlarm>();
  for (const alarm of normalized) if (!unique.has(alarm.id)) unique.set(alarm.id, alarm);
  return [...unique.values()].slice(0, MAX_WAKE_ALARMS);
}

export function updateGroupWakeAlarmTime(wakeTime: string): Promise<WakeAlarmsSync> {
  latestGroupTime = wakeTime;
  return serialize(async () => {
    const alarms = normalizeGroupAlarm((await readStoredWithoutQueue()) ?? [], latestGroupTime);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(alarms));
    latest = alarms;
    return reconcile(alarms);
  });
}

export function enableWakeAlarmSystem(alarms: WakeAlarm[]): Promise<WakeAlarmsSync> {
  latest = alarms;
  return serialize(async () => {
    const module = asModule();
    if (!module) return reconcile(alarms);
    const permission = await module.requestWakeAlarmAuthorization().catch(() => 'error' as const);
    const result = await reconcile(latest ?? alarms);
    return { ...result, authorization: permission === 'authorized' ? result.authorization : permission };
  });
}

export function makeWakeAlarm(time: string, index: number): WakeAlarm {
  return { id: `alarm-${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, label: `アラーム ${index}`, time, weekdays: [...ALL_WEEKDAYS], enabled: true, groupLinked: false };
}
