import type { Acquisition } from '../../scripts/data/model.ts';

export function activeAcquisitionsAt(acquisitions: Acquisition[], tMs: number): Acquisition[] {
  return acquisitions.filter((a) => a.startMs <= tMs && tMs <= a.endMs);
}

export function primaryAcquisition(
  active: Acquisition[],
  tMs: number,
  focusedSatellite: string | null,
): Acquisition | null {
  let primary: Acquisition | null = null;
  let bestMid = Number.POSITIVE_INFINITY;

  for (const acquisition of active) {
    if (focusedSatellite && acquisition.satid !== focusedSatellite) continue;
    const distance = Math.abs((acquisition.startMs + acquisition.endMs) / 2 - tMs);
    if (distance < bestMid) {
      bestMid = distance;
      primary = acquisition;
    }
  }

  return primary;
}
