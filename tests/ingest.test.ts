import { describe, expect, it } from 'vitest';
import { buildTle, parseUtcMs, type ArcGisFeature, type CatalogElement } from '../scripts/data/fetch.ts';
import { normalizeFeature } from '../scripts/data/normalize.ts';
import { buildSamplers, poseAt, sampleSat } from '../scripts/data/ephemeris.ts';
import { sliceAcquisition } from '../scripts/data/slicing.ts';
import { ecefToGeodetic, type LonLat } from '../src/lib/geometry.ts';
import type { Satellite } from '../scripts/data/model.ts';

// Frozen canonical RCM-1 element (same source as tests/tle.test.ts).
const frozenEl: CatalogElement = {
  objectName: 'RCM-1',
  intlDesignator: '2019-033A',
  noradCatId: '44322',
  epochMs: Date.parse('2026-08-18T15:22:15.647232Z'),
  meanMotion: 14.92590041,
  eccentricity: 0.00015391,
  inclination: 97.7607,
  raOfAscNode: 237.2063,
  argOfPericenter: 92.2147,
  meanAnomaly: 44.1605,
  bstar: '.50998489E-4',
  meanMotionDot: '.469E-5',
  meanMotionDdot: '0',
  ephemerisType: '0',
  classification: 'U',
  elementSetNo: 999,
  revAtEpoch: 39139,
};
const tle = buildTle(frozenEl);
const sat: Satellite = {
  norad: 44322,
  name: 'RCM-1',
  intl: frozenEl.intlDesignator,
  epochMs: frozenEl.epochMs,
  tle: { line1: tle.line1, line2: tle.line2 },
};
const rec = buildSamplers([sat])[0].rec;

describe('parseUtcMs (ingest epoch parse)', () => {
  it('treats a zone-less ISO string as UTC', () => {
    expect(parseUtcMs('2026-09-02T04:11:53')).toBe(Date.parse('2026-09-02T04:11:53Z'));
    expect(parseUtcMs('2026-08-18T15:22:15.647232')).toBe(
      Date.parse('2026-08-18T15:22:15.647232Z'),
    );
  });
  it('passes through strings that already carry a zone', () => {
    expect(parseUtcMs('2026-09-02T04:11:53Z')).toBe(Date.parse('2026-09-02T04:11:53Z'));
  });
  it('throws on empty / garbage', () => {
    expect(() => parseUtcMs('')).toThrow();
    expect(() => parseUtcMs('not-a-time')).toThrow();
  });
});

describe('normalizeFeature', () => {
  it('maps a non-crossing Polygon feature into an Acquisition (UTC times)', () => {
    const feature: ArcGisFeature = {
      id: 109308,
      properties: {
        OBJECTID: 109308,
        SATID: 'RCM-1',
        BEAMTYPE_EN: 'Low Resolution 100m',
        BEAMID: 'SC100MHVA',
        POLTYPE_EN: 'Dual HH-VV Polarization',
        TXPOL: 'H+V',
        EXACTCCD_EN: 'FALSE',
        PRODTYPE_EN: 'GRD - 16bit',
        RADARMD: 'ScanSAR',
        UTC_STRT: '2026-09-02T04:11:53',
        UTC_END: '2026-09-02T04:12:39',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [120, 50],
            [130, 50],
            [130, 60],
            [120, 60],
            [120, 50],
          ],
        ],
      },
    };
    const a = normalizeFeature(feature, 'planned', 0);
    expect(a).not.toBeNull();
    expect(a!.satid).toBe('RCM-1');
    expect(a!.id).toBe('planned-109308');
    expect(a!.product).toBe('GRD - 16bit');
    expect(a!.startMs).toBe(Date.parse('2026-09-02T04:11:53Z'));
    expect(a!.endMs).toBe(Date.parse('2026-09-02T04:12:39Z'));
    expect(a!.footprint.length).toBe(1);
    expect(a!.centroid).not.toBeNull();
  });

  it('splits a ring that crosses the antimeridian into two', () => {
    const ring = [
      [179, 40],
      [179, 50],
      [-179, 50],
      [-179, 40],
      [179, 40],
    ] as [number, number][];
    const feature: ArcGisFeature = {
      id: 7,
      properties: {
        OBJECTID: 7,
        SATID: 'RCM-2',
        UTC_STRT: '2026-09-02T04:11:53',
        UTC_END: '2026-09-02T04:12:39',
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
    const a = normalizeFeature(feature, 'past', 1);
    expect(a).not.toBeNull();
    expect(a!.footprint.length).toBe(2);
  });

  it('drops a feature with an unparseable time', () => {
    const feature: ArcGisFeature = {
      id: 8,
      properties: { OBJECTID: 8, SATID: 'RCM-1', UTC_STRT: 'garbage', UTC_END: 'garbage' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    };
    expect(normalizeFeature(feature, 'planned', 2)).toBeNull();
  });
});

describe('ephemeris sampling (SGP4)', () => {
  it('produces ECF points at the right LEO radius over a short window', () => {
    const s = sampleSat(rec, frozenEl.epochMs, frozenEl.epochMs + 3_600_000, 60_000, 100);
    expect(s.t.length).toBeGreaterThanOrEqual(55);
    for (const p of s.pos) {
      const r = Math.hypot(p[0], p[1], p[2]) / 1000; // km
      expect(r).toBeGreaterThan(6800);
      expect(r).toBeLessThan(7100);
    }
    // monotonically increasing time
    expect(s.t[0]).toBeLessThan(s.t[s.t.length - 1]);
    // velocity magnitude ~7.5 km/s for a LEO at ~600 km
    const v = Math.hypot(s.vel[0][0], s.vel[0][1], s.vel[0][2]);
    expect(v).toBeGreaterThan(7000);
    expect(v).toBeLessThan(8000);
  });

  it('returns a pose with consistent origin for slicing', () => {
    const pose = poseAt(rec, frozenEl.epochMs)!;
    expect(pose).not.toBeNull();
    const g = ecefToGeodetic(pose.pos);
    expect(Math.abs(g.lat)).toBeLessThan(91);
    expect(Math.abs(g.lon)).toBeLessThan(181);
  });
});

describe('sliceAcquisition (ingest + real pose)', () => {
  it('slices a footprint box near the satellite into ordered bands', () => {
    const mid = frozenEl.epochMs;
    const pose = poseAt(rec, mid)!;
    const g = ecefToGeodetic(pose.pos);
    const c: LonLat = [g.lon, g.lat];
    // a box straddling the along-track origin
    const ring: LonLat[] = [
      [c[0] - 0.5, c[1] - 0.3],
      [c[0] + 0.5, c[1] - 0.3],
      [c[0] + 0.5, c[1] + 0.3],
      [c[0] - 0.5, c[1] + 0.3],
      [c[0] - 0.5, c[1] - 0.3],
    ];
    const acq = {
      id: 'planned-1',
      kind: 'planned' as const,
      satid: 'RCM-1',
      beam: 'LR',
      beamId: 'SC',
      pol: 'H+V',
      polType: 'Dual',
      ccd: 'FALSE',
      product: 'GRD',
      radarMode: 'ScanSAR',
      startMs: mid - 20_000,
      endMs: mid + 20_000,
      footprint: [ring],
      centroid: c,
    };
    const sliced = sliceAcquisition(acq, pose, 8);
    expect(sliced.sliceError).toBeNull();
    expect(sliced.params).not.toBeNull();
    expect(sliced.slices.length).toBeGreaterThanOrEqual(1);
    for (const sl of sliced.slices) {
      // each slice is a closed ring with >=3 vertices
      expect(sl.length).toBeGreaterThanOrEqual(3);
    }
  });
});
