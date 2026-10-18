import { request } from './client';
import { getSession } from './session';
export type GroupResponse = {
  group: { id: string; name: string; inviteCode: string };
  members: { id: string; name: string; color?: string; wakeTime: string; tz: string; status: 'awake' | 'sleeping' | 'late'; checkedAt?: string }[];
  localDate: string; streak: number; bestStreak: number; week: boolean[];
  days: { local_date: string; result: string; late_user_ids: string }[];
};
async function authorized<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const { token } = await getSession();
  return request<T>(path, { method, body, token });
}
export const createGroup = (name: string) => authorized<{ id: string; name: string; inviteCode: string }>('/v1/groups', 'POST', { name });
export const joinGroup = (code: string) => authorized<{ id: string }>('/v1/groups/join', 'POST', { code });
export const checkIn = () => authorized<{ groupId: string; userId: string; localDate: string; checkedAt: string }>('/v1/checkins', 'POST');
export const fetchGroup = () => authorized<GroupResponse>('/v1/groups/me');
export const updateMe = (profile: { name?: string; wakeTime?: string; pushToken?: string | null }) => authorized<{ ok: true }>('/v1/me', 'PATCH', { ...profile, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
