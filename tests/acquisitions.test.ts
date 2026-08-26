import { describe, expect, it } from 'vitest';
import type { Acquisition } from '../scripts/data/model.ts';
import {
  activeAcquisitionsAt,
  primaryAcquisition,
} from '../src/mission/active-acquisitions.ts';

function acquisition(id: string, satid: string, startMs: number, endMs: number): Acquisition {
  return {
    id,
    kind: 'planned',
    satid,
    beam: '',
    beamId: '',
    pol: '',
    polType: '',
    ccd: '',
    product: '',
    radarMode: '',
    startMs,
    endMs,
    footprint: [],
    centroid: null,
  };
}

describe('active acquisitions', () => {
  const rcm1 = acquisition('rcm-1', 'RCM-1', 100, 320);
  const rcm2 = acquisition('rcm-2', 'RCM-2', 150, 250);
  const later = acquisition('later', 'RCM-3', 400, 500);

  it('returns every acquisition whose interval contains the mission time', () => {
    expect(activeAcquisitionsAt([rcm1, rcm2, later], 200)).toEqual([rcm1, rcm2]);
    expect(activeAcquisitionsAt([rcm1, rcm2, later], 150)).toEqual([rcm1, rcm2]);
  });

  it('uses the nearest midpoint as the primary overview acquisition', () => {
    expect(primaryAcquisition([rcm1, rcm2], 170, null)).toBe(rcm2);
    expect(primaryAcquisition([rcm1, rcm2], 280, null)).toBe(rcm1);
  });

  it('keeps primary selection on the focused satellite without hiding other activity', () => {
    const active = activeAcquisitionsAt([rcm1, rcm2], 200);
    expect(active).toHaveLength(2);
    expect(primaryAcquisition(active, 200, 'RCM-1')).toBe(rcm1);
    expect(primaryAcquisition(active, 200, 'RCM-3')).toBeNull();
  });
});
