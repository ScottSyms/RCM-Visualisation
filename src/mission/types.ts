/**
 * App-level (view / control) types. The shared data model
 * (`Acquisition`, `Satellite`, `Manifest`, `EphemerisPackage`, `SlicedAcquisition`)
 * lives in scripts/data/model.ts and is imported as types where needed.
 */

/** How the camera is currently driven. */
export type CameraMode = 'overview' | 'follow' | 'acquisition';

/** Which satellite follows / is in focus. */
export type FollowTarget = 'satellite' | 'acquisition';

/** Immutable-ish description of a satellite for the scene + UI. */
export interface SatelliteView {
  norad: number;
  name: string;
  intl: string;
  epochMs: number;
  color: string;
  /** latitude (deg) for ordering only. */
  inclination: number;
}

/** Lightweight acquisition row used by the list / search / card UI. */
export interface AcquisitionView {
  id: string;
  kind: 'planned' | 'past';
  satid: string;
  beam: string;
  pol: string;
  product: string;
  startMs: number;
  endMs: number;
  centroid: [number, number] | null;
}

/** Runtime state surfaced in the diagnostics panel. */
export interface DiagnosticLine {
  at: number;
  level: 'info' | 'ok' | 'warn' | 'error';
  text: string;
}

/** Everything needed to locate a footprint for the sweep / picker. */
export interface AcquisitionGeometry {
  id: string;
  kind: 'planned' | 'past';
  satid: string;
  startMs: number;
  endMs: number;
  footprint: [number, number][][];
  centroid: [number, number] | null;
}
