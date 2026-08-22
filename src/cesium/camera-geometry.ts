import { v3, type Vec3 } from '../lib/geometry.ts';

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  direction: Vec3;
  up: Vec3;
}

const BACK_OFFSET_M = 360_000;
const LOOK_AHEAD_M = 220_000;
const LOOK_DOWN_M = 1_200_000;

/**
 * Fixed trailing composition derived only from orbit velocity and nadir. It
 * deliberately does not steer toward individual acquisitions, so the same
 * wide perspective is maintained throughout satellite-view mode.
 */
export function satelliteViewPose(
  previousSatellite: Vec3,
  satellite: Vec3,
  viewHeightM = 3_000_000,
): CameraPose {
  const forward = v3.normalize(v3.sub(satellite, previousSatellite));
  const radialUp = v3.normalize(satellite);
  const position = v3.add(
    v3.sub(satellite, v3.scale(forward, BACK_OFFSET_M)),
    v3.scale(radialUp, viewHeightM),
  );
  const target = v3.add(
    v3.add(satellite, v3.scale(forward, LOOK_AHEAD_M)),
    v3.scale(radialUp, -LOOK_DOWN_M),
  );
  const direction = v3.normalize(v3.sub(target, position));
  let right = v3.cross(direction, radialUp);
  if (v3.len(right) < 1e-6) right = v3.cross(direction, forward);
  right = v3.normalize(right);
  const up = v3.normalize(v3.cross(right, direction));
  return { position, target, direction, up };
}
