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
