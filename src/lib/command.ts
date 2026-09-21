/** Client for the natural-language command bar backend (functions/api/command.ts). */
import type { CommandIntent } from '../mission/types.ts';

export async function requestCommand(query: string, nowMs: number): Promise<CommandIntent> {
  const res = await fetch('/api/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, nowMs }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { intent?: CommandIntent } | null;
  if (!body?.intent) throw new Error(`command API → HTTP ${res.status}`);
  return body.intent;
}
