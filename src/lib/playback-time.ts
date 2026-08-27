const EXPLICIT_ZONE = /(?:z|[+-]\d{2}:?\d{2})$/i;

export function parseUtcTimestamp(value: string | null | undefined): number | null {
  const input = value?.trim();
  if (!input) return null;
  const normalized = input.includes('T') && !EXPLICIT_ZONE.test(input) ? `${input}Z` : input;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampTimestamp(timestampMs: number, startMs: number, endMs: number): number {
  return Math.min(endMs, Math.max(startMs, timestampMs));
}

export function resolvePlaybackStart(
  value: string | null | undefined,
  fallbackMs: number,
  startMs: number,
  endMs: number,
): number {
  return clampTimestamp(parseUtcTimestamp(value) ?? fallbackMs, startMs, endMs);
}

export function formatUtcInput(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 19);
}

export function resolvePlaybackWindow(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  fallbackStartMs: number,
  winStartMs: number,
  winEndMs: number,
): { startMs: number; endMs: number } {
  let startMs = clampTimestamp(parseUtcTimestamp(startValue) ?? fallbackStartMs, winStartMs, winEndMs);
  let endMs = clampTimestamp(parseUtcTimestamp(endValue) ?? winEndMs, winStartMs, winEndMs);
  if (endMs < startMs) endMs = startMs;
  return { startMs, endMs };
}

export function buildPlaybackUrl(href: string, timestampMs: number, endMs?: number | null): string {
  const url = new URL(href);
  url.searchParams.set('start', new Date(timestampMs).toISOString());
  if (endMs != null) url.searchParams.set('end', new Date(endMs).toISOString());
  return url.toString();
}

export function buildPlaybackWindowUrl(href: string, startMs: number, endMs: number): string {
  const url = new URL(href);
  url.searchParams.set('start', new Date(startMs).toISOString());
  url.searchParams.set('end', new Date(endMs).toISOString());
  return url.toString();
}
