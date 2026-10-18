import { AppState } from 'react-native';
import * as api from './api/okiyo';
import { ApiError, isApiConfigured } from './api/client';
import { getSession } from './api/session';
import { create } from 'zustand';
import { applyResult } from './lib/streak';
import { stopRingingWakeAlarm } from './lib/wakeAlarm';
import { syncStoredWakeAlarms } from './lib/wakeAlarms';
import { beginWakeFollowup, clearWakeFollowup, getWakeFollowup, type WakeFollowup } from './lib/wakeFollowup';

// Notifications are best-effort and must never change action success or rollback.
const remind = (wakeTime: string) => {
  try { void syncStoredWakeAlarms(wakeTime).catch(() => {}); } catch {}
};

// API URL が未設定なら完全ローカルのデモとして動作する。

export type MemberStatus = 'awake' | 'sleeping' | 'late';

export type Member = {
  id: string;
  name: string;
  color: string;
  wakeTime: string; // "HH:mm"
  status: MemberStatus;
  checkedAt?: string;
  isMe?: boolean;
};

type State = {
  /** 起動時の読み込みが終わったか。API未設定（デモ）なら最初から true */
  hydrated: boolean;
  error: string | null;
  wakeFollowup: WakeFollowup | null;
  refreshWakeFollowup: () => Promise<void>;
  refresh: () => Promise<void>;
  onboarded: boolean;
  myName: string;
  wakeTime: string;
  groupName: string;
  inviteCode: string;
  streak: number;
  bestStreak: number;
  week: boolean[]; // 直近7日（古い順）。全員起床=true
  members: Member[];
  setWakeTime: (t: string) => void;
  /** グループを作成して参加する。失敗時はユーザー向けの日本語メッセージを持つ Error を投げる */
  createGroup: (name: string) => Promise<void>;
  /** 招待コードで参加する。失敗時（コード不正・満員など）は日本語メッセージの Error を投げる */
  joinGroup: (code: string) => Promise<void>;
  checkIn: () => void;
  /** 全員起床ならストリーク+1。誰か寝坊ならリセット。結果を返す */
  closeDay: () => 'kept' | 'broken';
  resetDemo: () => void;
  wakeAllDemo: () => void;
};

const demoMembers = (wakeTime: string): Member[] => [
  { id: 'me', name: 'あなた', color: '#FF9500', wakeTime, status: 'sleeping', isMe: true },
  { id: 'm1', name: 'はると', color: '#1CB0F6', wakeTime: '06:30', status: 'awake', checkedAt: '06:24' },
  { id: 'm2', name: 'みお', color: '#CE82FF', wakeTime: '07:00', status: 'awake', checkedAt: '06:52' },
  { id: 'm3', name: 'そうた', color: '#58CC02', wakeTime: '07:00', status: 'sleeping' },
];

const nowHHmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const LIVE = isApiConfigured();

export const useApp = create<State>((set, get) => ({
  error: null,
  wakeFollowup: null,
  refreshWakeFollowup: async () => {
    const userId = get().members.find((m) => m.isMe)?.id;
    set({ wakeFollowup: await getWakeFollowup(userId) });
  },
  hydrated: !isApiConfigured(),
  refresh: async () => {
    if (!isApiConfigured()) return;
    try {
      const [data, session] = await Promise.all([api.fetchGroup(), getSession()]);
      set({ ...mapGroup(data, session.userId), error: null });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) { set({ onboarded: false }); return; }
      set({ error: message(error) });
      throw error;
    } finally {
      set({ hydrated: true });
    }
  },
  onboarded: false,
  myName: 'あなた',
  wakeTime: '06:30',
  // API接続時は空から始め、サーバーの値で埋める（デモ用の値を一瞬でも見せない）
  groupName: LIVE ? '' : '朝活なかま',
  inviteCode: LIVE ? '' : 'PIYO-4821',
  streak: LIVE ? 0 : 12,
  bestStreak: LIVE ? 0 : 18,
  week: LIVE ? [false, false, false, false, false, false, false] : [true, true, true, true, true, true, false],
  members: LIVE ? [] : demoMembers('06:30'),
  setWakeTime: (wakeTime) => {
    const previous = get().wakeTime;
    if (previous !== wakeTime) remind(wakeTime);
    set((s) => ({ wakeTime, error: null, members: s.members.map((m) => (m.isMe ? { ...m, wakeTime } : m)) }));
    if (isApiConfigured()) void api.updateMe({ wakeTime }).catch(error => {
      if (get().wakeTime === wakeTime) {
        set(s => ({ wakeTime: previous, error: message(error), members: s.members.map(m => m.isMe ? { ...m, wakeTime: previous } : m) }));
        remind(previous);
      }
    });
  },
  createGroup: async (name) => {
    const groupName = name || '朝活なかま';
    if (!isApiConfigured()) { set({ onboarded: true, groupName }); remind(get().wakeTime); return; }
    const previous = get();
    set({ groupName, error: null });
    try {
      await api.updateMe({ name: get().myName, wakeTime: get().wakeTime });
      await api.createGroup(groupName);
      await get().refresh();
      remind(get().wakeTime);
    } catch (error) { set({ groupName: previous.groupName, error: message(error) }); throw error; }
  },
  joinGroup: async (code) => {
    if (!/^PIYO-\d{4}$/.test(code)) throw new Error('招待コードは PIYO-1234 の形です');
    if (!isApiConfigured()) { set({ onboarded: true, inviteCode: code }); remind(get().wakeTime); return; }
    const previous = get().inviteCode;
    set({ inviteCode: code, error: null });
    try {
      await api.updateMe({ name: get().myName, wakeTime: get().wakeTime });
      await api.joinGroup(code);
      await get().refresh();
      remind(get().wakeTime);
    } catch (error) { set({ inviteCode: previous, error: message(error) }); throw error; }
  },
  checkIn: () => {
    if (checkingIn) return;
    // This path is reached only after the user explicitly completes the check-in gesture.
    void stopRingingWakeAlarm();
    const previous = get().members;
    const wasAlreadyAwake = previous.some((m) => m.isMe && m.status === 'awake');
    const optimistic = previous.map((m): Member => m.isMe ? { ...m, status: 'awake', checkedAt: nowHHmm() } : m);
    set({ members: optimistic, error: null });
    const userId = previous.find((m) => m.isMe)?.id ?? 'local-user';
    if (!wasAlreadyAwake) void beginWakeFollowup(userId).then((wakeFollowup) => set({ wakeFollowup })).catch(() => {});
    if (!isApiConfigured()) return;
    checkingIn = true;
    void api.checkIn().then(result => {
      set(s => ({ members: s.members.map(m => m.id === result.userId ? { ...m, status: 'awake', checkedAt: localHHmm(result.checkedAt) } : m) }));
    }).catch(error => {
      if (!wasAlreadyAwake) void clearWakeFollowup(userId).then(() => set({ wakeFollowup: null })).catch(() => {});
      set(s => ({ error: message(error), members: s.members.map(m => {
        const old = previous.find(p => p.id === m.id);
        return m.isMe && old ? { ...m, status: old.status, checkedAt: old.checkedAt } : m;
      }) }));
    }).finally(() => { checkingIn = false; });
  },
  closeDay: () => {
    const s = get();
    if (isApiConfigured()) return s.members.every(m => m.status === 'awake') ? 'kept' : 'broken';
    const allAwake = s.members.every((m) => m.status === 'awake');
    // Demo deliberately judges status synchronously; judgeDay validates real timestamps/windows.
    const result = allAwake ? 'kept' : 'broken';
    set({
      ...applyResult(s.streak, s.bestStreak, s.week, result),
      members: allAwake ? s.members : s.members.map((m) => (m.status === 'sleeping' ? { ...m, status: 'late' } : m)),
    });
    return result;
  },
  wakeAllDemo: () => {
    if (!__DEV__ || isApiConfigured()) return;
    set((s) => ({
      members: s.members.map((m) => (m.status === 'awake' ? m : { ...m, status: 'awake', checkedAt: m.checkedAt ?? '06:58' })),
    }));
  },
  resetDemo: () => {
    if (!__DEV__ || isApiConfigured()) return;
    set((s) => ({ streak: 12, week: [true, true, true, true, true, true, false], members: demoMembers(s.wakeTime) }));
  },
}));

const palette = ['#FF9500', '#1CB0F6', '#CE82FF', '#58CC02', '#FF4B4B', '#2B70C9'];
const message = (error: unknown) => error instanceof Error ? error.message : 'うまくいきませんでした';
const localHHmm = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
export function mapGroup(data: api.GroupResponse, userId: string) {
  const me = data.members.find(m => m.id === userId);
  return {
    onboarded: true, groupName: data.group.name, inviteCode: data.group.inviteCode,
    streak: data.streak, bestStreak: data.bestStreak,
    // サーバーは判定済みの日だけ返す（0〜7件）。表示は常に7日なので古い側を false で埋める
    week: [...Array<boolean>(Math.max(0, 7 - data.week.length)).fill(false), ...data.week.slice(-7)],
    ...(me ? { myName: me.name, wakeTime: me.wakeTime } : {}),
    members: data.members.map((m, index): Member => ({
      id: m.id, name: m.name, // 色はUIの領分なので、参加順でパレットから割り当てる（サーバーの色は使わない）
      color: palette[index % palette.length], wakeTime: m.wakeTime,
      status: m.status, isMe: m.id === userId, checkedAt: m.checkedAt ? localHHmm(m.checkedAt) : undefined,
    })),
  };
}
let checkingIn = false;
let pollingCleanup: (() => void) | undefined;
/** Call once from the app root; stopPolling removes both timer and listener. */
export function startPolling(): () => void {
  if (pollingCleanup) return stopPolling;
  if (!isApiConfigured()) return stopPolling;
  let timer: ReturnType<typeof setInterval> | undefined;
  let refreshing = false;
  const refresh = () => {
    if (refreshing) return;
    refreshing = true;
    void useApp.getState().refresh().catch(() => {}).finally(() => { refreshing = false; });
  };
  const pause = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  const resume = () => { pause(); refresh(); timer = setInterval(refresh, 30_000); };
  const subscription = AppState.addEventListener('change', state => { if (state === 'active') resume(); else pause(); });
  pollingCleanup = () => { pause(); subscription.remove(); };
  if (AppState.currentState === 'active') resume();
  return stopPolling;
}
export function stopPolling(): void { pollingCleanup?.(); pollingCleanup = undefined; }
