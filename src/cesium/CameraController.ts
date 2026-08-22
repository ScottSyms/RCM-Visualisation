/**
 * Drives the Cesium camera across the mission's camera modes:
 *
 * - overview     : a wide, framed view of the operational region
 * - follow       : tracks a moving satellite every frame
 * - acquisition  : framed on the active acquisition footprint
 */
import type { Camera, Cartesian3, Viewer } from 'cesium';
import type { CameraMode } from '../mission/types.ts';
import { satelliteViewPose } from './camera-geometry.ts';
import type { Vec3 } from '../lib/geometry.ts';

export interface Focus {
  lon: number;
  lat: number;
  altM: number;
  heading?: number;
  pitch?: number;
}

export interface SatelliteViewSource {
  satelliteAt: (tMs: number) => Vec3 | null;
}

type DrivenCamera =
  | { kind: 'overview' }
  | { kind: 'follow'; positionAt: (tMs: number) => Vec3 | null }
  | {
      kind: 'acquisition';
      source: SatelliteViewSource;
    };

export class CameraController {
  private viewer: Viewer;
  private driven: DrivenCamera = { kind: 'overview' };
  private flightSeq = 0;
  private previousFov: number | null = null;
  private satelliteViewHeightM = 3_000_000;

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

  trackSatelliteView(source: SatelliteViewSource, tMs: number): boolean {
    const desired = desiredPose(source, tMs, this.satelliteViewHeightM);
    if (!desired) return false;
    this.cancelDrivenView();
    this.setWideFieldOfView();
    this.driven = {
      kind: 'acquisition',
      source,
    };
    this.viewer.camera.setView({
      destination: toCartesian(desired.position),
      orientation: {
        direction: toCartesian(desired.direction),
        up: toCartesian(desired.up),
      },
    });
    return true;
  }

  setSatelliteViewHeight(heightM: number): void {
    this.satelliteViewHeightM = heightM;
  }

  cancelDrivenView(): void {
    this.flightSeq++;
    this.viewer.camera.cancelFlight();
    this.driven = { kind: 'overview' };
    this.restoreFieldOfView();
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  private setWideFieldOfView(): void {
    const frustum = this.viewer.camera.frustum as unknown as { fov?: number };
    if (typeof frustum.fov !== 'number') return;
    this.previousFov = frustum.fov;
    frustum.fov = Cesium.Math.toRadians(70);
  }

  private restoreFieldOfView(): void {
    if (this.previousFov == null) return;
    const frustum = this.viewer.camera.frustum as unknown as { fov?: number };
    if (typeof frustum.fov === 'number') frustum.fov = this.previousFov;
    this.previousFov = null;
  }

  /** Advance follow tracking one frame. Call on `postRender`. */
  tick(tMs: number, camera: Camera): void {
    if (this.driven.kind === 'follow') {
      const p = this.driven.positionAt(tMs);
      if (!p) return;
      camera.lookAt(toCartesian(p), new Cesium.HeadingPitchRange(0.0, -0.16, 160_000));
      return;
    }
    if (this.driven.kind !== 'acquisition') return;

    const desired = desiredPose(this.driven.source, tMs, this.satelliteViewHeightM);
    if (!desired) return;
    camera.setView({
      destination: toCartesian(desired.position),
      orientation: {
        direction: toCartesian(desired.direction),
        up: toCartesian(desired.up),
      },
    });
  }
}

function desiredPose(source: SatelliteViewSource, tMs: number, viewHeightM: number) {
  const satellite = source.satelliteAt(tMs);
  if (!satellite) return null;
  let previous = source.satelliteAt(tMs - 1_000);
  if (!previous) {
    const next = source.satelliteAt(tMs + 1_000);
    previous = next
      ? [2 * satellite[0] - next[0], 2 * satellite[1] - next[1], 2 * satellite[2] - next[2]]
      : null;
  }
  if (!previous) return null;
  return satelliteViewPose(previous, satellite, viewHeightM);
}

function toCartesian(p: Vec3): Cartesian3 {
  return new Cesium.Cartesian3(p[0], p[1], p[2]);
}
