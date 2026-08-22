/**
 * Loads the generated mission data set from /data (written by `npm run data`).
 * Everything is static JSON; the browser re-derives the ephemeris from the TLEs.
 */
import type {
  Acquisition,
  EphemerisPackage,
  Manifest,
  PastPoint,
  Satellite,
} from '../../scripts/data/model.ts';

export interface MissionData {
  manifest: Manifest;
  satellites: Satellite[];
  planned: Acquisition[];
  /** Slim completed-acquisition markers (centroid dots; footprints stay on disk). */
  past: PastPoint[];
  /** Optional: the raw source ephemeris package (debug overlay). */
  ephemeris: EphemerisPackage | null;
}

export class DataMissingError extends Error {
  constructor(what: string) {
    super(`missing: ${what}`);
    this.name = 'DataMissingError';
  }
}

async function loadJson<T>(name: string, base = '/data'): Promise<T> {
  const res = await fetch(`${base}/${name}.json`, { cache: 'no-cache' });
  if (res.status === 404 || res.status === 403) {
    const e = new Error(`${name}.json → HTTP ${res.status}`) as Error & { notFound?: boolean };
    e.notFound = true;
    throw e;
  }
  if (!res.ok) throw new Error(`${name}.json → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Loads the full bundle. Throws `DataMissingError`-tagged errors when the file
 * simply is not there (so the UI can suggest `npm run data`), and plain errors
 * for transport/parse failures.
 */
export async function loadMissionData(base = '/data'): Promise<MissionData> {
  const [manifest, satellites, planned, past, ephResult] = await Promise.all([
    loadJson<Manifest>('manifest', base),
    loadJson<Satellite[]>('satellites', base),
    loadJson<Acquisition[]>('planned', base),
    loadJson<PastPoint[]>('past.points', base),
    loadJson<EphemerisPackage>('ephemeris', base).catch((e) => {
      // ephemeris is only needed for the debug source-samples overlay
      return (e as { notFound?: boolean }).notFound ? null : Promise.reject(e);
    }),
  ]);

  // Guard against a stale/duplicated data file (an earlier buggy ingest could
  // emit ~900k rows, which blows Cesium's point-cloud buffer allocation). Fail
  // fast here in JS rather than as a GPU RangeError in the renderer.
  if (past.length > 500_000) {
    throw new Error(
      `past.points.json has ${past.length} rows — regenerate with a clean 'npm run data' (stale file?)`,
    );
  }

  return { manifest, satellites, planned, past, ephemeris: ephResult ?? null };
}

/** Canonical window the timeline covers: the *planned* (active) window. */
export function plannedWindow(planned: Acquisition[]): { startMs: number; endMs: number } | null {
  if (planned.length === 0) return null;
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  for (const a of planned) {
    if (a.startMs < startMs) startMs = a.startMs;
    if (a.endMs > endMs) endMs = a.endMs;
  }
  return { startMs, endMs };
}
