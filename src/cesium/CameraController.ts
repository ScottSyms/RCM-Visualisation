/**
 * Drives the Cesium camera across the mission's camera modes:
 *
 * - overview     : a wide, framed view of the operational region
 * - follow       : tracks a moving satellite every frame
 * - acquisition  : framed on the active acquisition footprint
 */
import type { Camera, Cartesian3, Viewer } from 'cesium';
import type { CameraMode } from '../mission/types.ts';
import { acquisitionCameraPose, dampFactor } from './camera-geometry.ts';
import type { Vec3 } from '../lib/geometry.ts';

export interface Focus {
  lon: number;
  lat: number;
  altM: number;
  heading?: number;
  pitch?: number;
}

export interface AcquisitionCameraSource {
  satelliteAt: (tMs: number) => Vec3 | null;
  targetAt: (tMs: number) => Vec3 | null;
}

type DrivenCamera =
  | { kind: 'overview' }
  | { kind: 'follow'; positionAt: (tMs: number) => Vec3 | null }
  | {
      kind: 'acquisition';
      source: AcquisitionCameraSource;
      transitioning: boolean;
      smoothedPosition: Cartesian3 | null;
      smoothedTarget: Cartesian3 | null;
      lastRealMs: number;
      lastMissionMs: number;
    };

export class CameraController {
  private viewer: Viewer;
  private driven: DrivenCamera = { kind: 'overview' };
  private flightSeq = 0;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  mode(): CameraMode {
    return this.driven.kind;
  }

  toOverview(): void {
    this.cancelDrivenView();
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-93, 46, 32_000_000),
      duration: 1.4,
    });
  }

  /** Track a satellite. `positionAt` returns the ECEF position (m) at absolute time. */
  follow(positionAt: (tMs: number) => Vec3 | null): void {
    this.cancelDrivenView();
    this.driven = { kind: 'follow', positionAt };
  }

  /** Leave follow mode, restoring free orbit. */
  unfollow(): void {
    if (this.driven.kind === 'overview') return;
    this.cancelDrivenView();
  }

  focus(focus: Focus): void {
    this.cancelDrivenView();
    const dest = Cesium.Cartesian3.fromDegrees(focus.lon, focus.lat, focus.altM);
    this.viewer.camera.flyTo({
      destination: dest,
      orientation: {
        heading: focus.heading ?? 0,
        pitch: focus.pitch ?? -Math.PI / 2.4,
        roll: 0,
      },
      duration: 1.2,
    });
  }

  async trackAcquisition(source: AcquisitionCameraSource, tMs: number): Promise<boolean> {
    const desired = desiredPose(source, tMs);
    if (!desired) return false;
    this.cancelDrivenView();
    const seq = this.flightSeq;
    this.driven = {
      kind: 'acquisition',
      source,
      transitioning: true,
      smoothedPosition: null,
      smoothedTarget: null,
      lastRealMs: performance.now(),
      lastMissionMs: tMs,
    };

    return await new Promise<boolean>((resolve) => {
      let resolved = false;
      const finish = (ok: boolean): void => {
        if (resolved) return;
        resolved = true;
        resolve(ok);
      };
      this.viewer.camera.flyTo({
        destination: toCartesian(desired.pose.position),
        orientation: {
          direction: toCartesian(desired.pose.direction),
          up: toCartesian(desired.pose.up),
        },
        duration: 1.4,
        complete: () => {
          if (seq !== this.flightSeq || this.driven.kind !== 'acquisition') {
            finish(false);
            return;
          }
          this.driven.transitioning = false;
          this.driven.smoothedPosition = toCartesian(desired.pose.position);
          this.driven.smoothedTarget = toCartesian(desired.target);
          this.driven.lastRealMs = performance.now();
          this.driven.lastMissionMs = tMs;
          finish(true);
        },
        cancel: () => finish(false),
      });
    });
  }

  cancelDrivenView(): void {
    this.flightSeq++;
    this.viewer.camera.cancelFlight();
    this.driven = { kind: 'overview' };
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  /** Advance follow tracking one frame. Call on `postRender`. */
  tick(tMs: number, camera: Camera): void {
    if (this.driven.kind === 'follow') {
      const p = this.driven.positionAt(tMs);
      if (!p) return;
      camera.lookAt(toCartesian(p), new Cesium.HeadingPitchRange(0.0, -0.16, 160_000));
      return;
    }
    if (this.driven.kind !== 'acquisition' || this.driven.transitioning) return;

    const desired = desiredPose(this.driven.source, tMs);
    if (!desired) return;
    const now = performance.now();
    const jumped = Math.abs(tMs - this.driven.lastMissionMs) > 5_000;
    const alpha = jumped
      ? 1
      : dampFactor(Math.min(0.1, Math.max(0, (now - this.driven.lastRealMs) / 1000)), 0.35);
    const desiredPosition = toCartesian(desired.pose.position);
    const desiredTarget = toCartesian(desired.target);
    if (!this.driven.smoothedPosition || !this.driven.smoothedTarget || alpha >= 1) {
      this.driven.smoothedPosition = desiredPosition;
      this.driven.smoothedTarget = desiredTarget;
    } else {
      Cesium.Cartesian3.lerp(
        this.driven.smoothedPosition,
        desiredPosition,
        alpha,
        this.driven.smoothedPosition,
      );
      Cesium.Cartesian3.lerp(
        this.driven.smoothedTarget,
        desiredTarget,
        alpha,
        this.driven.smoothedTarget,
      );
    }
    this.driven.lastRealMs = now;
    this.driven.lastMissionMs = tMs;

    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(
        this.driven.smoothedTarget,
        this.driven.smoothedPosition,
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );
    const satellite = this.driven.source.satelliteAt(tMs);
    if (!satellite) return;
    const radialUp = Cesium.Cartesian3.normalize(toCartesian(satellite), new Cesium.Cartesian3());
    const right = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(direction, radialUp, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const up = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    camera.setView({
      destination: this.driven.smoothedPosition,
      orientation: { direction, up },
    });
  }
}

function desiredPose(source: AcquisitionCameraSource, tMs: number) {
  const satellite = source.satelliteAt(tMs);
  const target = source.targetAt(tMs);
  if (!satellite || !target) return null;
  let previous = source.satelliteAt(tMs - 1_000);
  if (!previous) {
    const next = source.satelliteAt(tMs + 1_000);
    previous = next
      ? [2 * satellite[0] - next[0], 2 * satellite[1] - next[1], 2 * satellite[2] - next[2]]
      : null;
  }
  if (!previous) return null;
  return { pose: acquisitionCameraPose(previous, satellite, target), target };
}

function toCartesian(p: Vec3): Cartesian3 {
  return new Cesium.Cartesian3(p[0], p[1], p[2]);
}
