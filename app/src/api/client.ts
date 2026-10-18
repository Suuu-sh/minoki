export const isApiConfigured = () => Boolean(process.env.EXPO_PUBLIC_API_URL?.trim());
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function request<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('接続先が設定されていません');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10_000);
    });
    return await Promise.race([ (async () => {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      if (!response.ok) {
        const message = response.status === 409 ? 'このグループは満員です（6人まで）'
          : response.status === 404 && path === '/v1/groups/join' ? '招待コードが見つかりません'
          : response.status === 401 ? '認証できませんでした。もう一度試してね' : 'うまくいきませんでした。もう一度試してね';
        throw new ApiError(response.status, message);
      }
      return await response.json() as T;
    })(), timeout]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('つながりませんでした。電波を確認してね');
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
