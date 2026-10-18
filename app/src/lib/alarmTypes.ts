export const GROUP_ALARM_ID = 'group-primary';
export const MAX_WAKE_ALARMS = 8;
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type WakeAlarm = {
  id: string;
  label: string;
  time: string;
  /** 0=Sunday through 6=Saturday, matching JavaScript Date.getDay(). */
  weekdays: number[];
  enabled: boolean;
  groupLinked: boolean;
};

export type AlarmDelivery = 'scheduled' | 'notification' | 'disabled' | 'error' | 'unsupported' | 'denied' | 'notDetermined' | 'authorized';
export type WakeAlarmsSync = {
  authorization: 'unsupported' | 'notDetermined' | 'denied' | 'authorized' | 'scheduled' | 'error';
  deliveries: Record<string, AlarmDelivery>;
};

export const isValidWakeTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const isValidWeekdays = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
