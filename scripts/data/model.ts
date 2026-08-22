import type { LonLat } from '../../src/lib/geometry.ts';
import type { SliceParams } from '../../src/lib/geometry.ts';

/** A satellite with the two TLE lines used to construct the SGP4 satrec. */
export interface Satellite {
  norad: number;
  name: string;
  intl: string;
  epochMs: number;
  tle: { line1: string; line2: string };
}

/** Normalized acquisition record (before slicing). */
export interface Acquisition {
  /** stable id: `${kind}-${OBJECTID}`. */
  id: string;
  kind: 'planned' | 'past';
  satid: string;
  beam: string; // BEAMTYPE_EN
  beamId: string; // BEAMID
  pol: string; // TXPOL
  polType: string; // POLTYPE_EN
  ccd: string; // EXACTCCD_EN
  product: string; // PRODTYPE_EN
  radarMode: string; // RADARMD
  startMs: number;
  endMs: number;
  /** footprint split at the antimeridian; each ring is a closed LonLat ring. */
  footprint: LonLat[][];
  /** planar ring centroid (degrees), a reasonable fly-to target. */
  centroid: LonLat | null;
}

/**
 * Slim completed-acquisition marker for the browser's point cloud.
 * Footprints of past acquisitions stay in `past.json` for parity/QGIS use;
 * the app only needs the centroid dots, so the served file is tiny.
 */
export interface PastPoint {
  sat: string;
  startMs: number;
  endMs: number;
  centroid: LonLat | null;
}

/** Acquisition plus its tangent-plane slice model (spec 10.3). */
export interface SlicedAcquisition extends Acquisition {
  origin: LonLat;
  /** along-track unit axis in local ENU [east, north]. */
  axis: [number, number];
  slices: LonLat[][];
  params: SliceParams | null;
  sliceError: string | null;
}

/** Canonical ephemeris sample (spec 9.1). Coordinates in metres, ECEF/ITRF. */
export interface EphemerisSample {
  satelliteId: string;
  timeUtc: string;
  x: number;
  y: number;
  z: number;
  frame: 'ITRF' | 'ECEF';
}

/** Raw-sample package for the debug overlay + accurate positions. */
export interface EphemerisPackage {
  frame: 'ECEF';
  unit: 'm';
  stepMs: number;
  satellites: Record<
    string,
    {
      name: string;
      norad: number;
      /** ms since epoch, uniform grid. */
      t: number[];
      /** ECEF metres, parallel to t. */
      pos: [number, number, number][];
      /** ECI velocity m/s, parallel to t (for spacecraft orientation). */
      vel: [number, number, number][];
    }
  >;
}

/** Top-level manifest describing the generated data set. */
export interface Manifest {
  generatedAt: string;
  source: {
    arcgis: string;
    celestrak: string;
  };
  window: { startMs: number; endMs: number };
  past: { count: number; startMs: number | null; endMs: number | null };
  planned: { count: number; startMs: number | null; endMs: number | null };
  /** recommended clock seed = pre-roll of the first planned acquisition. */
  clockSeedMs: number | null;
  satellites: Array<Pick<Satellite, 'norad' | 'name' | 'intl' | 'epochMs'>>;
  ephemeris: { stepMs: number; startMs: number; endMs: number };
}

export type OutputBundle = {
  manifest: Manifest;
  satellites: Satellite[];
  planned: SlicedAcquisition[];
  past: Acquisition[];
  ephemeris: EphemerisPackage;
};
