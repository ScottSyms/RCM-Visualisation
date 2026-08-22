import type { ArcGisFeature } from './fetch.ts';
import { parseUtcMs } from './fetch.ts';
import {
  crossesAntimeridian,
  ringCentroid,
  splitRingAtAntimeridian,
  type LonLat,
} from '../../src/lib/geometry.ts';
import type { Acquisition } from './model.ts';

type Kind = 'planned' | 'past';

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** 6 decimals ≈ 0.11 m — ample for display/slicing, and cuts JSON size ~30%. */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

function ringOf(coords: unknown[]): LonLat[] | null {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const ring: LonLat[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    ring.push([round6(lon), round6(lat)]);
  }
  return ring;
}

/** Extract closed lon/lat rings from a Polygon or MultiPolygon geometry. */
export function featureRings(f: ArcGisFeature): LonLat[][] {
  const g = f.geometry;
  if (!g || !g.coordinates) return [];
  const rings: LonLat[][] = [];
  const push = (r: LonLat[] | null) => {
    if (r && r.length >= 3) rings.push(r);
  };
  if (g.type === 'Polygon') {
    const polys = g.coordinates;
    if (Array.isArray(polys)) {
      for (const poly of polys) push(ringOf(poly as unknown[]));
    }
  } else if (g.type === 'MultiPolygon') {
    const polys = g.coordinates;
    if (Array.isArray(polys)) {
      for (const poly of polys) {
        if (!Array.isArray(poly)) continue;
        for (const ring of poly) push(ringOf(ring as unknown[]));
      }
    }
  }
  return rings;
}

/**
 * Split a footprint's rings at the antimeridian so each renderable ring lies on
 * one side of the date line. Non-crossing rings pass through unchanged.
 */
export function antiMeritidianSplit(rings: LonLat[][]): LonLat[][] {
  const out: LonLat[][] = [];
  for (const ring of rings) {
    if (crossesAntimeridian(ring)) out.push(...splitRingAtAntimeridian(ring));
    else out.push(ring);
  }
  return out;
}

/** Normalize a single ArcGIS feature into an Acquisition (null on bad data). */
export function normalizeFeature(f: ArcGisFeature, kind: Kind, index: number): Acquisition | null {
  const p = f.properties ?? {};
  const satid = str(p, 'SATID').trim();
  if (!satid) return null;

  const startRaw = str(p, 'UTC_STRT');
  const endRaw = str(p, 'UTC_END');
  let startMs: number, endMs: number;
  try {
    startMs = parseUtcMs(startRaw);
    endMs = parseUtcMs(endRaw);
  } catch {
    return null; // unparseable time -> drop (diagnostics reported elsewhere)
  }

  const rings = featureRings(f);
  const footprint = antiMeritidianSplit(rings);
  if (footprint.length === 0) return null;

  // centroid for fly-to: the largest ring by vertex count
  let centroid: LonLat | null = null;
  let best = 0;
  for (const r of footprint) if (r.length > best) { best = r.length; centroid = ringCentroid(r); }
  if (centroid) centroid = [round6(centroid[0]), round6(centroid[1])];

  return {
    id: `${kind}-${str(p, 'OBJECTID') || (f.id ?? index)}`,
    kind,
    satid,
    beam: str(p, 'BEAMTYPE_EN'),
    beamId: str(p, 'BEAMID'),
    pol: str(p, 'TXPOL'),
    polType: str(p, 'POLTYPE_EN'),
    ccd: str(p, 'EXACTCCD_EN'),
    product: str(p, 'PRODTYPE_EN'),
    radarMode: str(p, 'RADARMD'),
    startMs,
    endMs,
    footprint,
    centroid,
  };
}
