import { describe, expect, it } from 'vitest';
import { satelliteViewPose } from '../src/cesium/camera-geometry.ts';
import { v3, type Vec3 } from '../src/lib/geometry.ts';

describe('satellite-view camera geometry', () => {
  it('places the camera behind and outward from the satellite', () => {
    const previous: Vec3 = [7_000_000, -1_000, 0];
    const satellite: Vec3 = [7_000_000, 0, 0];
    const pose = satelliteViewPose(previous, satellite);
    const forward = v3.normalize(v3.sub(satellite, previous));

    expect(v3.dot(v3.sub(pose.position, satellite), forward)).toBeLessThan(0);
    expect(v3.len(pose.position)).toBeGreaterThan(v3.len(satellite));
    expect(v3.len(v3.sub(pose.position, satellite))).toBeGreaterThan(500_000);
  });

  it('returns a finite orthonormal viewing frame aimed at its fixed orbital target', () => {
    const pose = satelliteViewPose([7_000_000, -1_000, 0], [7_000_000, 0, 0]);
    const expectedDirection = v3.normalize(v3.sub(pose.target, pose.position));

    for (const value of [...pose.position, ...pose.target, ...pose.direction, ...pose.up]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(v3.dot(pose.direction, expectedDirection)).toBeCloseTo(1, 8);
    expect(v3.len(pose.direction)).toBeCloseTo(1, 8);
    expect(v3.len(pose.up)).toBeCloseTo(1, 8);
    expect(v3.dot(pose.direction, pose.up)).toBeCloseTo(0, 8);
  });

  it('moves outward in exact 500 km height steps', () => {
    const previous: Vec3 = [7_000_000, -1_000, 0];
    const satellite: Vec3 = [7_000_000, 0, 0];
    const low = satelliteViewPose(previous, satellite, 500_000);
    const high = satelliteViewPose(previous, satellite, 1_000_000);
    const radial = v3.normalize(satellite);
    const outwardStep = v3.dot(v3.sub(high.position, low.position), radial);

    expect(outwardStep).toBeCloseTo(500_000, 6);
  });

  it('defaults to a 3000 km outward view height', () => {
    const satellite: Vec3 = [7_000_000, 0, 0];
    const pose = satelliteViewPose([7_000_000, -1_000, 0], satellite);
    const radial = v3.normalize(satellite);
    const outward = v3.dot(v3.sub(pose.position, satellite), radial);

    expect(outward).toBeCloseTo(3_000_000, 6);
  });
});
