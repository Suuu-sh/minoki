export type PushMessage = { to: string | null; title: string; body: string; sound?: string; data?: Record<string, unknown> };

/** Best-effort transport: push outages must never fail checkin or cron handlers. */
export async function sendExpoPush(input: readonly PushMessage[]): Promise<void> {
  const messages = input.filter(message => message.to).map(message => ({ sound: 'default', data: { url: '/checkin' }, ...message }));
  for (let offset = 0; offset < messages.length; offset += 100) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(offset, offset + 100)),
      });
      if (!response.ok) { console.error('Expo push HTTP failure', response.status); continue; }
      const result = await response.json() as { data?: { status?: string }[]; errors?: unknown[] };
      if (result.errors?.length || result.data?.some(ticket => ticket.status === 'error')) console.error('Expo push rejected notification');
    } catch { console.error('Expo push transport failure'); }
  }
}
