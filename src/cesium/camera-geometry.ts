import { v3, type Vec3 } from '../lib/geometry.ts';

export interface CameraPose {
  position: Vec3;
  direction: Vec3;
  up: Vec3;
}

const BACK_OFFSET_M = 110_000;
const OUTWARD_OFFSET_M = 55_000;

/**
 * Place the camera behind and above the spacecraft while looking toward the
 * authoritative ground footprint. This is a cinematic, schematic SAR view;
 * it does not imply measured spacecraft attitude.
 */
export function acquisitionCameraPose(
  previousSatellite: Vec3,
  satellite: Vec3,
  groundTarget: Vec3,
): CameraPose {
  const forward = v3.normalize(v3.sub(satellite, previousSatellite));
  const radialUp = v3.normalize(satellite);
  const position = v3.add(
    v3.sub(satellite, v3.scale(forward, BACK_OFFSET_M)),
    v3.scale(radialUp, OUTWARD_OFFSET_M),
  );
  const direction = v3.normalize(v3.sub(groundTarget, position));
  let right = v3.cross(direction, radialUp);
  if (v3.len(right) < 1e-6) right = v3.cross(direction, forward);
  right = v3.normalize(right);
  const up = v3.normalize(v3.cross(right, direction));
  return { position, direction, up };
}

export function dampFactor(deltaSeconds: number, timeConstantSeconds: number): number {
  if (deltaSeconds <= 0) return 0;
  if (timeConstantSeconds <= 0) return 1;
  return 1 - Math.exp(-deltaSeconds / timeConstantSeconds);
}
