import { describe, expect, it } from 'vitest';
import {
  clipPolyToRect,
  computeSlices,
  crossesAntimeridian,
  ecefToGeodetic,
  geodeticToEcef,
  gmstRad,
  projectPoint,
  projectRing,
  ringCentroid,
  signedCrossTrack,
  splitRingAtAntimeridian,
  type LonLat,
  type Vec2,
} from '../src/lib/geometry.ts';

describe('geodetic <-> ECEF', () => {
  const pts: [number, number, number][] = [
    [0, 0, 0],
    [123.45, 43.21, 0],
    [-123.45, -43.21, 0],
    [10, 80.5, 0],
    [-45.5, 89.99, 0],
    [-179.9, -58.1, 0],
    [-179.9, 65.2, 123],
    [179.5, -55, 0],
  ];
  it('round-trips within 1e-6 deg at the surface', () => {
    for (const [lon, lat, h] of pts) {
      const e = geodeticToEcef(lon, lat, h);
      const g = ecefToGeodetic(e);
      expect(Math.abs(g.lon - lon)).toBeLessThan(1e-6);
      expect(Math.abs(g.lat - lat)).toBeLessThan(1e-6);
      expect(Math.abs(g.h - h)).toBeLessThan(1);
    }
  });
  it('handles poles and cardinal axes', () => {
    const np = geodeticToEcef(0, 90, 0);
    const gp = ecefToGeodetic(np);
    expect(Math.abs(gp.lat - 90)).toBeLessThan(1e-6);
    const ecef = geodeticToEcef(90, 0, 0);
    expect(Math.abs(ecef[1] - 6378137)).toBeLessThan(1e-3);
  });
});

describe('GMST', () => {
  it('reproduces the J2000 reference GMST (~18h 41m 50.5s)', () => {
    const t = Date.parse('2000-01-01T12:00:00Z');
    const deg = (gmstRad(t) * 180) / Math.PI;
    expect(deg).toBeCloseTo(280.4613, 2);
  });
  it('advances one full turn per sidereal day', () => {
    const t0 = Date.parse('2026-08-18T00:00:00Z');
    const t1 = t0 + 86164090.5; // 86164.0905 s
    let d = ((gmstRad(new Date(t1).getTime()) - gmstRad(t0)) * 180) / Math.PI;
    if (d < 0) d += 360;
    expect(d).toBeCloseTo(359.99997, 3);
  });
});

describe('antimeridian split', () => {
  it('passes non-crossing rings through unchanged', () => {
    const ring: LonLat[] = [
      [10, 20],
      [20, 20],
      [20, 30],
      [10, 30],
      [10, 20],
    ];
    expect(crossesAntimeridian(ring)).toBe(false);
    expect(splitRingAtAntimeridian(ring)).toEqual([ring]);
  });

  it('splits a square straddling 180 into two closed rings', () => {
    const ring: LonLat[] = [
      [179, 40],
      [179, 50],
      [-179, 50],
      [-179, 40],
      [179, 40],
    ];
    const parts = splitRingAtAntimeridian(ring);
    expect(parts.length).toBe(2);
    for (const p of parts) {
      const first = p[0];
      const last = p[p.length - 1];
      expect(Math.abs(first[0] - last[0])).toBeLessThan(1e-6);
      expect(Math.abs(first[1] - last[1])).toBeLessThan(1e-6);
      expect(p.length).toBeGreaterThanOrEqual(4);
    }
    const east = parts.find((p) => p[0][0] > 0)!;
    const west = parts.find((p) => p[0][0] < 0)!;
    expect(east).toBeDefined();
    expect(west).toBeDefined();
    const eLons = east.map((v) => v[0]);
    const wLons = west.map((v) => v[0]);
    expect(Math.max(...eLons)).toBeCloseTo(180, 6);
    expect(Math.min(...eLons)).toBeCloseTo(179, 6);
    expect(Math.max(...wLons)).toBeCloseTo(-179, 6);
    expect(Math.min(...wLons)).toBeCloseTo(-180, 6);
  });

  it('splits a wide Pacific rectangle crossing the line twice', () => {
    const ring: LonLat[] = [
      [170, 10],
      [-170, 10],
      [-170, 20],
      [170, 20],
      [170, 10],
    ];
    const parts = splitRingAtAntimeridian(ring);
    expect(parts.length).toBe(2);
    const area = (p: LonLat[]) => {
      let a = 0;
      for (let i = 0; i + 1 < p.length; i++) {
        a += p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1];
      }
      return Math.abs(a) / 2;
    };
    expect(area(parts[0]) + area(parts[1])).toBeCloseTo(200, 0);
    for (const p of parts) {
      const lons = p.map((v) => v[0]);
      const span = Math.max(...lons) - Math.min(...lons);
      expect(span).toBeLessThan(180);
    }
  });
});

describe('ring centroid', () => {
  it('finds the square center', () => {
    const c = ringCentroid([
      [10, 20],
      [20, 20],
      [20, 30],
      [10, 30],
      [10, 20],
    ]);
    expect(c[0]).toBeCloseTo(15, 8);
    expect(c[1]).toBeCloseTo(25, 8);
  });
});

describe('sutherland-hodgman rect clip', () => {
  it('clips a square against a band', () => {
    const poly: Vec2[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const c = clipPolyToRect(poly, 4, 0, 6, 10);
    expect(c).not.toBeNull();
    expect(c!.length).toBe(4);
    expect(c![0][0]).toBeCloseTo(4);
    expect(c![1][0]).toBeCloseTo(6);
  });
  it('returns null for a fully-outside band', () => {
    const poly: Vec2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(clipPolyToRect(poly, 5, 0, 6, 1)).toBeNull();
  });
});

describe('projection round-trip', () => {
  const origin: LonLat = [-55.2, 60.1];
  const axis: [number, number] = [0.72, 0.695];
  it('projectRing -> projectPoint round-trips inside the patch', () => {
    const ring: LonLat[] = [
      [-56, 59.5],
      [-54, 59.5],
      [-54, 60.8],
      [-56, 60.8],
      [-56, 59.5],
    ];
    const proj = projectRing(ring, origin, axis);
    expect(proj.length).toBe(ring.length);
    for (const p of proj) {
      const back = projectPoint(p, origin, axis);
      expect(Math.abs(back[0] - origin[0])).toBeLessThan(1.5);
      expect(Math.abs(back[1] - origin[1])).toBeLessThan(1.5);
    }
  });
  it('axis-aligned projection maps along-track to x', () => {
    const proj = projectRing(
      [
        [-55.2, 59.9],
        [-55.2, 60.3],
      ],
      origin,
      [0, 1],
    );
    const dxKm = (proj[1][0] - proj[0][0]) / 1000;
    expect(Math.abs(dxKm - 44.4)).toBeLessThan(1.5); // ~44 km along +lat
    expect(Math.abs(proj[1][1] - proj[0][1]) / 1000).toBeLessThan(1); // ~0 cross-track
  });
});

describe('computeSlices', () => {
  it('produces ordered covers of the strip', () => {
    const origin: LonLat = [0, 0];
    const ring: LonLat[] = [
      [-1, -0.5],
      [1, -0.5],
      [1, 0.5],
      [-1, 0.5],
      [-1, -0.5],
    ];
    const result = computeSlices([ring], origin, [1, 0], 8);
    expect(result).not.toBeNull();
    const { slices, params } = result!;
    expect(params.n).toBe(8);
    expect(slices.length).toBeGreaterThanOrEqual(8);
    // every slice vertex must lie inside the strip's longitude/lat box
    for (const s of slices) {
      for (const v of s) {
        expect(v[0]).toBeGreaterThanOrEqual(-1.01);
        expect(v[0]).toBeLessThanOrEqual(1.01);
        expect(v[1]).toBeGreaterThanOrEqual(-0.51);
        expect(v[1]).toBeLessThanOrEqual(0.51);
      }
    }
    // min-x bands should tile the along-track extent
    const minX = Math.min(...slices.flatMap((s) => s.map((v) => v[0])));
    const maxX = Math.max(...slices.flatMap((s) => s.map((v) => v[0])));
    expect(minX).toBeCloseTo(-1, 1);
    expect(maxX).toBeCloseTo(1, 1);
  });
  it('returns null for degenerate inputs', () => {
    expect(
      computeSlices(
        [
          [
            [0, 0],
            [0, 1],
            [0, 0],
          ],
        ],
        [0, 0],
        [1, 0],
        8,
      ),
    ).toBeNull();
  });
});

describe('signed cross-track', () => {
  it('is positive for a point left of northward travel', () => {
    const origin: LonLat = [0, 0];
    expect(signedCrossTrack(origin, [1, 0.5], [0, 1])).toBeLessThan(0);
    expect(signedCrossTrack(origin, [-1, 0.5], [0, 1])).toBeGreaterThan(0);
  });
});
