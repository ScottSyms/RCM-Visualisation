/** Small formatting helpers shared by the UI. */

export function fmtUtc(ms: number): string {
  if (!isFinite(ms)) return '—';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export function fmtSpeed(m: number): string {
  return `${m}`;
}

/** log-line timestamp (HH:MM:SS.mmm local). */
export function fmtLog(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
