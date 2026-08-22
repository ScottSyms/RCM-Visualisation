import { describe, expect, it } from 'vitest';
import { propagate, twoline2satrec } from 'satellite.js';
import { buildTle, tleChecksum, type CatalogElement } from '../scripts/data/fetch.ts';

// Frozen from the public GP feed (CelesTrak catalogue), RCM-1, NORAD 44322.
// The canonical TLE two lines (checksums included) are the ground truth: buildTle
// must reproduce them byte-for-byte from the equivalent catalog element.
const REF_L1 = '1 44322U 19033A   26230.64045888  .00000469  00000+0  50998-4 0  9990';
const REF_L2 = '2 44322  97.7607 237.2063 0001539  92.2147  44.1605 14.92590041391399';

const el: CatalogElement = {
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

const D = (deg: number): number => (deg * Math.PI) / 180;

describe('buildTle', () => {
  it('reproduces the canonical GP two lines byte-for-byte', () => {
    const { line1, line2 } = buildTle(el);
    expect(line1).toBe(REF_L1);
    expect(line2).toBe(REF_L2);
  });

  it('emits 69-char lines whose classic column checksum agrees with col 69', () => {
    const { line1, line2 } = buildTle(el);
    for (const line of [line1, line2]) {
      expect(line).toHaveLength(69);
      expect(Number(line[68])).toBe(tleChecksum(line));
    }
  });

  it('round-trips through satellite.js twoline2satrec', () => {
    const { line1, line2 } = buildTle(el);
    const s = twoline2satrec(line1, line2);

    expect(s.satnum).toBe('44322');
    expect(Math.abs(s.inclo - D(97.7607))).toBeLessThan(1e-9);
    expect(Math.abs(s.nodeo - D(237.2063))).toBeLessThan(1e-9);
    expect(Math.abs(s.argpo - D(92.2147))).toBeLessThan(1e-9);
    expect(Math.abs(s.mo - D(44.1605))).toBeLessThan(1e-9);
    expect(Math.abs(s.ecco - 0.0001539)).toBeLessThan(1e-9);
    expect(Math.abs(s.bstar - 5.0998e-5)).toBeLessThan(1e-9);
    // `nokozai` is the raw TLE mean motion (rad/min); `no` is Kozai-averaged.
    expect(Math.abs(s.nokozai - (el.meanMotion * 2 * Math.PI) / 1440)).toBeLessThan(1e-8);

    // epoch Julian date, parsed back from the 8-digit day fraction.
    const jdOfEpoch = el.epochMs / 86_400_000 + 2_440_587.5;
    expect(Math.abs(s.jdsatepoch - jdOfEpoch)).toBeLessThan(1e-4);
  });

  it('propagates a near-correct low-Earth-orbit radius at the epoch', () => {
    const { line1, line2 } = buildTle(el);
    const s = twoline2satrec(line1, line2);
    const st = propagate(s, new Date(el.epochMs));
    expect(st).not.toBeNull();
    expect(s.error).toBe(0); // SatRecError.None
    const pos = (st as NonNullable<typeof st>).position;
    const rKm = Math.hypot(pos.x, pos.y, pos.z); // satellite.js returns km
    expect(rKm).toBeGreaterThan(6900);
    expect(rKm).toBeLessThan(7060);
  });
});
