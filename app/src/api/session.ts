import * as SecureStore from 'expo-secure-store';
import { ApiError, request } from './client';
export type Session = { token: string; userId: string };
let pending: Promise<Session> | undefined;
/** Both token and identity survive reloads. Never infer self from member order. */
export function getSession(): Promise<Session> {
  if (!pending) pending = restore().catch(error => {
    pending = undefined;
    if (error instanceof ApiError || (error instanceof Error && /[ぁ-んァ-ヶ一-龠]/.test(error.message))) throw error;
    throw new Error('ユーザー情報を保存・復元できませんでした。もう一度試してね');
  });
  return pending;
}
// 接続先ごとに別のセッションを持つ（ローカル開発と本番でトークンを混ぜない）。SecureStore のキーは英数と . - _ のみ
const scope = () => (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]/g, '_');
const TOKEN_KEY = () => `okiyo.token.${scope()}`;
const USER_KEY = () => `okiyo.userId.${scope()}`;

async function restore(): Promise<Session> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY());
  const userId = await SecureStore.getItemAsync(USER_KEY());
  if (token && userId) return { token, userId };
  // An incomplete legacy session cannot identify self; do not silently create a new user.
  if (token) throw new Error('ユーザー情報を復元できませんでした');
  const session = await request<Session>('/v1/users', { method: 'POST', body: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
  await SecureStore.setItemAsync(USER_KEY(), session.userId);
  await SecureStore.setItemAsync(TOKEN_KEY(), session.token);
  return session;
}
