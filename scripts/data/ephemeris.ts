import { eciToEcf, propagate, gstime, twoline2satrec } from 'satellite.js';
import type { Satellite, EphemerisPackage } from './model.ts';

export interface SamplerSat {
  sat: Satellite;
  rec: ReturnType<typeof twoline2satrec>;
}

/** Build SGP4 satrecs from the supplied TLE pairs. */
export function buildSamplers(sats: Satellite[]): SamplerSat[] {
  return sats.map((sat) => ({ sat, rec: twoline2satrec(sat.tle.line1, sat.tle.line2) }));
}

/** ECF pose in metres (position m, velocity m/s) at `ms`, or null if it decays. */
export function poseAt(
  rec: SamplerSat['rec'],
  ms: number,
): { pos: [number, number, number]; vel: [number, number, number] } | null {
  const date = new Date(ms);
  const st = propagate(rec, date);
  if (!st) return null;
  const gmst = gstime(date);
  const p = eciToEcf(st.position, gmst); // km
  const v = eciToEcf(st.velocity, gmst); // km/s
  return {
    pos: [p.x * 1000, p.y * 1000, p.z * 1000],
    vel: [v.x * 1000, v.y * 1000, v.z * 1000],
  };
}

/**
 * Sample a satellite's ECF position + velocity on a uniform grid.
 *
 * - position: ECF metres (satellite.js ECI km, rotated by GMST)
 * - velocity: ECF m/s  (satellite.js ECI km/s rotated by GMST)
 *
 * Frames are consistent so the browser can derive a local (position, velocity,
 * nadir) spacecraft frame directly. Samples that fail to propagate (decayed)
 * are skipped — there are none for healthy RCM orbits.
 */
export function sampleSat(
  rec: SamplerSat['rec'],
  t0: number,
  t1: number,
  stepMs: number,
  maxSamples = Infinity,
): { t: number[]; pos: [number, number, number][]; vel: [number, number, number][] } {
  const t: number[] = [];
  const pos: [number, number, number][] = [];
  const vel: [number, number, number][] = [];
  let count = 0;
  for (let ms = t0; ms <= t1 && count < maxSamples; ms += stepMs) {
    const p = poseAt(rec, ms);
    if (!p) continue;
    t.push(ms);
    pos.push(p.pos);
    vel.push(p.vel);
    count++;
  }
  return { t, pos, vel };
}

/** Assemble the full ephemeris package for all satellites over a window. */
export function buildEphemerisPackage(
  sats: SamplerSat[],
  t0: number,
  t1: number,
  stepMs: number,
  maxSamples: number,
): EphemerisPackage {
  const satellites: EphemerisPackage['satellites'] = {};
  for (const { sat, rec } of sats) {
    const s = sampleSat(rec, t0, t1, stepMs, maxSamples);
    satellites[String(sat.norad)] = {
      name: sat.name,
      norad: sat.norad,
      t: s.t,
      pos: s.pos,
      vel: s.vel,
    };
  }
  return { frame: 'ECEF', unit: 'm', stepMs, satellites };
}
