import {
  computeSlices,
  ecefToGeodetic,
  enuFrame,
  v3,
  type LonLat,
} from '../../src/lib/geometry.ts';
import type { SliceParams } from '../../src/lib/geometry.ts';
import type { Acquisition, SlicedAcquisition } from './model.ts';

/** ECF pose in metres. */
export interface Pose {
  pos: [number, number, number];
  vel: [number, number, number];
}

/**
 * Derive the along-track unit axis (local ENU east/north) and geodetic origin
 * from an ECF position + velocity. The horizontal component of the ECF
 * velocity gives the along-track direction; the origin is the surface point
 * beneath the satellite.
 */
export function localFrameFromPose(
  pose: Pose,
): { origin: LonLat; axis: [number, number] } {
  const g = ecefToGeodetic(pose.pos);
  const frame = enuFrame([g.lon, g.lat]);
  const east = v3.dot(pose.vel, frame.E);
  const north = v3.dot(pose.vel, frame.N);
  const l = Math.hypot(east, north) || 1;
  return { origin: [g.lon, g.lat], axis: [east / l, north / l] };
}

/**
 * Slice an acquisition footprint into ordered progress bands (spec 10.3)
 * using the along-track axis from the ephemeris at the acquisition midpoint.
 */
export function sliceAcquisition(
  acq: Acquisition,
  pose: Pose,
  n: number,
): SlicedAcquisition {
  const { origin, axis } = localFrameFromPose(pose);
  let slices: LonLat[][] = [];
  let params: SliceParams | null = null;
  let sliceError: string | null = null;
  try {
    const res = computeSlices(acq.footprint, origin, axis, n);
    if (!res) {
      sliceError = 'empty clip: degenerate footprint at the tangent plane';
    } else {
      slices = res.slices;
      params = res.params;
    }
  } catch (e) {
    sliceError = e instanceof Error ? e.message : String(e);
  }
  return { ...acq, origin, axis, slices, params, sliceError };
}
