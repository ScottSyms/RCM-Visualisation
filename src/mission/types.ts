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

/** One of the three RCM spacecraft, by their `satid`/timeline name. */
export type RcmSatelliteName = 'RCM-1' | 'RCM-2' | 'RCM-3';

/**
 * A structured action produced by the natural-language command bar
 * (functions/api/command.ts) and applied by src/mission/CommandExecutor.ts.
 * Deliberately closed and small: nothing here lets the model invent an
 * acquisition id — acquisition-level search stays out of AI scope for now
 * (see README's Command Bar section).
 */
export type CommandIntent =
  | { type: 'selectSatellite'; satellite: RcmSatelliteName }
  | { type: 'clearSelection' }
  | { type: 'setSatelliteFilter'; satellites: RcmSatelliteName[] }
  | { type: 'setLayerVisible'; layer: 'planned' | 'past' | 'groundTrack'; visible: boolean }
  | { type: 'setCameraMode'; mode: 'overview' | 'follow'; satellite?: RcmSatelliteName }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'setSpeed'; multiplier: number }
  | { type: 'seek'; ms: number }
  | { type: 'seekRelative'; deltaSeconds: number }
  | { type: 'seekNow' }
  | { type: 'unrecognized'; reason: string };
