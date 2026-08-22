import { describe, expect, it } from 'vitest';
import { acquisitionCameraPose, dampFactor } from '../src/cesium/camera-geometry.ts';
import { v3, type Vec3 } from '../src/lib/geometry.ts';

describe('acquisition camera geometry', () => {
  it('places the camera behind and outward from the satellite', () => {
    const previous: Vec3 = [7_000_000, -1_000, 0];
    const satellite: Vec3 = [7_000_000, 0, 0];
    const target: Vec3 = [6_300_000, 300_000, 0];
    const pose = acquisitionCameraPose(previous, satellite, target);
    const forward = v3.normalize(v3.sub(satellite, previous));

    expect(v3.dot(v3.sub(pose.position, satellite), forward)).toBeLessThan(0);
    expect(v3.len(pose.position)).toBeGreaterThan(v3.len(satellite));
  });

  it('returns a finite orthonormal viewing frame aimed at the target', () => {
    const target: Vec3 = [6_300_000, 300_000, 50_000];
    const pose = acquisitionCameraPose([7_000_000, -1_000, 0], [7_000_000, 0, 0], target);
    const expectedDirection = v3.normalize(v3.sub(target, pose.position));

    for (const value of [...pose.position, ...pose.direction, ...pose.up]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(v3.dot(pose.direction, expectedDirection)).toBeCloseTo(1, 8);
    expect(v3.len(pose.direction)).toBeCloseTo(1, 8);
    expect(v3.len(pose.up)).toBeCloseTo(1, 8);
    expect(v3.dot(pose.direction, pose.up)).toBeCloseTo(0, 8);
  });

  it('uses frame-rate-independent exponential damping', () => {
    const oneFrame = dampFactor(1 / 30, 0.35);
    const twoFrames = 1 - (1 - dampFactor(1 / 60, 0.35)) ** 2;
    expect(oneFrame).toBeCloseTo(twoFrames, 10);
  });
});
