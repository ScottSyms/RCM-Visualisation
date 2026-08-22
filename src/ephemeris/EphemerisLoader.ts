/**
 * Bridges the data layer to SGP4 + Cesium. A satellite's runtime ephemeris is a
 * `satrec` (from its TLE) plus a view model (name, color) used across the UI.
 */
import { twoline2satrec, type SatRec } from 'satellite.js';
import type { Satellite } from '../../scripts/data/model.ts';
import type { SatelliteView } from '../mission/types.ts';

export const SAT_COLORS = ['#5eead4', '#a78bfa', '#fbbf24'];

export interface SatelliteEphemeris {
  view: SatelliteView;
  rec: SatRec;
  index: number;
}

export function buildEphemerides(sats: Satellite[]): SatelliteEphemeris[] {
  return sats.map((sat, i) => ({
    index: i,
    rec: twoline2satrec(sat.tle.line1, sat.tle.line2),
    view: {
      norad: sat.norad,
      name: sat.name,
      intl: sat.intl,
      epochMs: sat.epochMs,
      color: SAT_COLORS[i % SAT_COLORS.length],
      inclination: 97.8,
    },
  }));
}
