/**
 * Drives the Cesium camera across the mission's camera modes:
 *
 * - overview     : a wide, framed view of the operational region
 * - follow       : tracks a moving satellite every frame
 * - acquisition  : framed on the active acquisition footprint
 */
import type { Camera, Viewer } from 'cesium';
import type { CameraMode } from '../mission/types.ts';

export interface Focus {
  lon: number;
  lat: number;
  altM: number;
  heading?: number;
  pitch?: number;
}

export class CameraController {
  private viewer: Viewer;
  private followPos: ((tMs: number) => [number, number, number] | null) | null = null;
  private following = false;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  mode(): CameraMode {
    return this.following ? 'follow' : 'overview';
  }

  toOverview(): void {
    if (this.following) {
      this.following = false;
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-93, 46, 32_000_000),
      duration: 1.4,
    });
  }

  /** Track a satellite. `positionAt` returns the ECEF position (m) at absolute time. */
  follow(positionAt: (tMs: number) => [number, number, number] | null): void {
    this.followPos = positionAt;
    this.following = true;
  }

  /** Leave follow mode, restoring free orbit. */
  unfollow(): void {
    if (!this.following) return;
    this.following = false;
    this.followPos = null;
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  focus(focus: Focus): void {
    if (this.following) {
      this.unfollow();
    }
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

  /** Advance follow tracking one frame. Call on `postRender`. */
  tick(tMs: number, camera: Camera): void {
    if (!this.following || !this.followPos) return;
    const p = this.followPos(tMs);
    if (!p) return;
    camera.lookAt(
      new Cesium.Cartesian3(p[0], p[1], p[2]),
      new Cesium.HeadingPitchRange(0.0, -0.16, 160_000),
    );
  }
}
