export function entityId(picked: unknown): string | null {
  if (!picked || typeof picked !== 'object') return null;
  const raw = (picked as { id?: unknown }).id;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string') {
    return (raw as { id: string }).id;
  }
  return null;
}

export function parseAcqId(entityId: string): string | null {
  if (!entityId.startsWith('acq-')) return null;
  const m = entityId.match(/^acq-(.+)-\d+$/);
  return m ? m[1] : null;
}

export function parseSatNorad(entityId: string): number | null {
  if (!entityId.startsWith('sat-')) return null;
  const norad = Number(entityId.slice(4));
  return Number.isFinite(norad) ? norad : null;
}
