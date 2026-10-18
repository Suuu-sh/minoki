import { requireOptionalNativeModule } from 'expo';

type NativeWakeAction = {
  getConfirmedWakeId: () => string | null;
  clearConfirmedWakeId: () => void;
  setPendingWake: (wakeId: string, checkedAt: number) => void;
  clearPendingWake: (wakeId: string) => void;
  areLiveActivitiesEnabled: () => boolean;
  getWakeAlarmStatus: () => Promise<{ state: 'unsupported' | 'notDetermined' | 'denied' | 'authorized' | 'scheduled' | 'error'; wakeTime?: string }>;
  requestWakeAlarmAuthorization: () => Promise<'unsupported' | 'notDetermined' | 'denied' | 'authorized' | 'error'>;
  scheduleWakeAlarm: (wakeTime: string) => Promise<{ state: 'unsupported' | 'notDetermined' | 'denied' | 'authorized' | 'scheduled' | 'error'; wakeTime?: string }>;
  reconcileWakeAlarms: (alarms: Array<{ id: string; label: string; time: string; weekdays: number[]; enabled: boolean; groupLinked: boolean }>) => Promise<{ state: 'unsupported' | 'notDetermined' | 'denied' | 'authorized' | 'scheduled' | 'error'; alarms?: Array<{ id: string; state: 'scheduled' | 'error' | 'disabled' }> }>;
  stopRingingWakeAlarm: () => Promise<void>;
  consumeWakeAlarmStopIntent: () => boolean;
};

export const nativeWakeAction = requireOptionalNativeModule<NativeWakeAction>('OkiyoWakeAction');
