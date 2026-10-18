/// <reference types="jest" />
jest.mock('../src/lib/notifications', () => ({ scheduleWakeReminder: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/lib/wakeFollowup', () => ({
  beginWakeFollowup: jest.fn().mockResolvedValue(null),
  clearWakeFollowup: jest.fn().mockResolvedValue(null),
  getWakeFollowup: jest.fn().mockResolvedValue(null),
}));

const mockStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
}));
const fetchMock = jest.fn();
globalThis.fetch = fetchMock;
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => { jest.resetModules(); mockStorage.clear(); fetchMock.mockReset(); process.env.EXPO_PUBLIC_API_URL = 'https://example.test/'; });
afterEach(() => { jest.useRealTimers(); delete process.env.EXPO_PUBLIC_API_URL; });
it('creates one concurrent session and restores identity and token after reload', async () => {
  fetchMock.mockResolvedValue(reply({ userId: 'self', token: 'secret' }));
  let { getSession } = require('../src/api/session');
  const results = await Promise.all([getSession(), getSession()]);
  expect(results[0]).toEqual(results[1]); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockStorage.get('okiyo.token.example.test_')).toBe('secret');
  jest.resetModules(); fetchMock.mockClear(); ({ getSession } = require('../src/api/session'));
  expect(await getSession()).toEqual({ userId: 'self', token: 'secret' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('sends bearer and timezone profile, maps API error messages', async () => {
  mockStorage.set('okiyo.token.example.test_', 'secret'); mockStorage.set('okiyo.userId.example.test_', 'self');
  const api = require('../src/api/okiyo');
  fetchMock.mockResolvedValue(reply({ ok: true }));
  await api.updateMe({ wakeTime: '08:00' });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', headers: { Authorization: 'Bearer secret' }, body: JSON.stringify({ wakeTime: '08:00', tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  fetchMock.mockResolvedValue(reply({}, 409));
  await expect(api.joinGroup('PIYO-1234')).rejects.toThrow('このグループは満員です（6人まで）');
  fetchMock.mockResolvedValue(reply({}, 404));
  await expect(api.joinGroup('PIYO-1234')).rejects.toThrow('招待コードが見つかりません');
  fetchMock.mockRejectedValue(new TypeError('network'));
  await expect(api.fetchGroup()).rejects.toThrow('つながりませんでした。電波を確認してね');
});
it('times out even when fetch never settles', async () => {
  jest.useFakeTimers(); fetchMock.mockImplementation(() => new Promise(() => {}));
  const { request } = require('../src/api/client');
  const result = expect(request('/v1/users')).rejects.toThrow('つながりませんでした。電波を確認してね');
  await jest.advanceTimersByTimeAsync(10_000); await result;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
it('keeps unset URL completely local', async () => {
  delete process.env.EXPO_PUBLIC_API_URL;
  const { useApp } = require('../src/store');
  await useApp.getState().createGroup('local'); await useApp.getState().joinGroup('PIYO-1234');
  useApp.getState().checkIn(); await useApp.getState().refresh();
  expect(useApp.getState().members.find((m: {isMe: boolean}) => m.isMe).status).toBe('awake');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rolls optimistic check-in back without rejection and disables backend demo mutations', async () => {
  mockStorage.set('okiyo.token.example.test_', 'secret'); mockStorage.set('okiyo.userId.example.test_', 'self');
  const { useApp } = require('../src/store');
  // API接続時は空のメンバーから始まるので、サーバーから読み込んだ状態を用意する
  useApp.setState({ members: [{ id: 'self', name: 'あなた', color: '#FF9500', wakeTime: '06:30', status: 'sleeping', isMe: true }] });
  const previous = useApp.getState().members;
  fetchMock.mockRejectedValue(new Error('offline'));
  expect(useApp.getState().checkIn()).toBeUndefined();
  expect(useApp.getState().members[0].status).toBe('awake');
  await flush();
  expect(useApp.getState().members).toEqual(previous);
  expect(useApp.getState().error).toContain('電波');
  useApp.getState().wakeAllDemo(); useApp.getState().resetDemo(); useApp.getState().closeDay();
  expect(useApp.getState().members).toEqual(previous);
});
it('maps self by saved id, colors in join order and device-local checked time', () => {
  const { mapGroup } = require('../src/store');
  const iso = '2026-10-18T00:10:00Z', date = new Date(iso);
  const mapped = mapGroup({ group: { name: 'g', inviteCode: 'PIYO-1234' }, streak: 1, bestStreak: 2, week: [true], members: [
    { id: 'other', name: 'o', wakeTime: '07:00', status: 'late' },
    { id: 'self', name: 's', wakeTime: '08:00', status: 'awake', color: '#abc', checkedAt: iso },
  ] }, 'self');
  expect(mapped.members[0]).toMatchObject({ isMe: false, status: 'late', color: '#FF9500' });
  // 判定済みが1日だけでも、表示用に7日分へ埋める
  expect(mapped.week).toEqual([false, false, false, false, false, false, true]);
  // サーバーの color は無視し、参加順のパレット色を使う
  expect(mapped.members[1]).toMatchObject({ isMe: true, color: '#1CB0F6', checkedAt: `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}` });
});
it('polls only foreground, installs once and cleans timer and listener', async () => {
  jest.useFakeTimers();
  const { AppState } = require('react-native');
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  let onChange: (state: string) => void = () => {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((...args: unknown[]) => { onChange = args[1] as typeof onChange; return { remove }; });
  const { useApp, startPolling, stopPolling } = require('../src/store');
  const refresh = jest.fn(async () => {}); useApp.setState({ refresh });
  startPolling(); startPolling(); await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(30_000); expect(refresh).toHaveBeenCalledTimes(2);
  onChange('background'); await jest.advanceTimersByTimeAsync(60_000); expect(refresh).toHaveBeenCalledTimes(2);
  onChange('active'); await flush(); expect(refresh).toHaveBeenCalledTimes(3);
  stopPolling(); stopPolling(); await jest.advanceTimersByTimeAsync(60_000);
  expect(remove).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledTimes(3);
});
it('refreshes group and rolls back create/join optimistic fields on failure', async () => {
  mockStorage.set('okiyo.token.example.test_', 'secret'); mockStorage.set('okiyo.userId.example.test_', 'self');
  const { useApp } = require('../src/store');
  fetchMock.mockResolvedValue(reply({ group: { id: 'g', name: 'server', inviteCode: 'PIYO-0001' }, members: [{ id: 'self', name: 'me', wakeTime: '09:00', status: 'sleeping', tz: 'Asia/Tokyo' }], streak: 3, bestStreak: 4, week: [true], days: [], localDate: '2026-10-18' }));
  await useApp.getState().refresh();
  expect(useApp.getState()).toMatchObject({ onboarded: true, groupName: 'server', wakeTime: '09:00', streak: 3 });
  fetchMock.mockRejectedValue(new Error('offline'));
  await expect(useApp.getState().createGroup('optimistic')).rejects.toThrow('電波');
  expect(useApp.getState().groupName).toBe('server');
  await expect(useApp.getState().joinGroup('PIYO-9999')).rejects.toThrow('電波');
  expect(useApp.getState().inviteCode).toBe('PIYO-0001');
});

it('uses the specified sixth join-order palette color', () => {
  const { mapGroup } = require('../src/store');
  const mapped = mapGroup({ group: { name: 'g', inviteCode: 'PIYO-1234' }, streak: 0, bestStreak: 0, week: [], members: Array.from({ length: 6 }, (_, index) => ({ id: String(index), name: 'm', wakeTime: '07:00', status: 'sleeping' })) }, '0');
  expect(mapped.members[5].color).toBe('#2B70C9');
});
it('keeps a separate session per API URL (local and production do not share tokens)', async () => {
  mockStorage.set('okiyo.token.example.test_', 'secret'); mockStorage.set('okiyo.userId.example.test_', 'self');
  process.env.EXPO_PUBLIC_API_URL = 'https://prod.example/';
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ userId: 'new', token: 'fresh' }) });
  const { getSession } = require('../src/api/session');
  await expect(getSession()).resolves.toEqual({ userId: 'new', token: 'fresh' });
  expect(mockStorage.get('okiyo.token.prod.example_')).toBe('fresh');
  expect(mockStorage.get('okiyo.token.example.test_')).toBe('secret');
});
