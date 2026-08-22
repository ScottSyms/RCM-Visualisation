/**
 * Cesium entities for the constellation. For each satellite it builds a
 * `SampledPositionProperty` on a 30 s SGP4 grid over the timeline window (the
 * browser re-derives the orbit every frame — scrub-safe, spec §9), plus a faint
 * clamped ground track so the two-week coverage is legible.
 */
import type {
  Cartesian3,
  Entity,
  JulianDate,
  SampledPositionProperty,
  Viewer,
} from 'cesium';
import { poseAt, sampleSat } from '../../scripts/data/ephemeris.ts';
import { ecefToGeodetic } from '../lib/geometry.ts';
import type { SatelliteEphemeris } from './EphemerisLoader.ts';

export interface SatelliteRuntime {
  id: string;
  norad: number;
  name: string;
  color: string;
  entity: Entity;
  track: Entity;
  trail: Entity;
  position: SampledPositionProperty;
}

/** 30 s along-track grid keeps browser-side SGP4 sampling smooth and bounded. */
const GRID_STEP_MS = 30_000;
/** one ground-track vertex per 120 s keeps the line crisp but cheap. */
const TRACK_STRIDE = 4;
/** short orbit trail behind each spacecraft (spec L4: 10–20 min). */
const TRAIL_MS = 15 * 60_000;
const TRAIL_STEP_MS = 60_000;

interface Grid {
  t: number[];
  pos: [number, number, number][];
}

function sampleGrid(e: SatelliteEphemeris, t0: number, t1: number): Grid {
  const grid = sampleSat(e.rec, t0, t1, GRID_STEP_MS, 1_000_000);
  if (grid.t.at(-1) !== t1) {
    const endpoint = poseAt(e.rec, t1);
    if (endpoint) {
      grid.t.push(t1);
      grid.pos.push(endpoint.pos);
    }
  }
  return grid;
}

function fillPosition(g: Grid): SampledPositionProperty {
  const prop = new Cesium.SampledPositionProperty();
  for (let i = 0; i < g.t.length; i++) {
    prop.addSample(
      Cesium.JulianDate.fromDate(new Date(g.t[i])),
      Cesium.Cartesian3.fromElements(g.pos[i][0], g.pos[i][1], g.pos[i][2]),
    );
  }
  return prop;
}

function addGroundTrack(viewer: Viewer, g: Grid, norad: number, color: string): Entity {
  const positions: Cartesian3[] = [];
  for (let i = 0; i < g.t.length; i += TRACK_STRIDE) {
    const geo = ecefToGeodetic(g.pos[i]);
    if (!Number.isFinite(geo.lon) || !Number.isFinite(geo.lat)) continue;
    positions.push(Cesium.Cartesian3.fromDegrees(geo.lon, geo.lat, 0));
  }
  return viewer.entities.add({
    id: `track-${norad}`,
    polyline: {
      positions,
      width: 1,
      arcType: Cesium.ArcType.GEODESIC,
      material: Cesium.Color.fromCssColorString(color).withAlpha(0.18),
    },
  });
}

function addTrail(
  viewer: Viewer,
  position: SampledPositionProperty,
  norad: number,
  color: string,
): Entity {
  const positions = new Cesium.CallbackProperty((time: JulianDate | undefined): Cartesian3[] => {
    if (!time) return [];
    const endMs = Cesium.JulianDate.toDate(time).getTime();
    const points: Cartesian3[] = [];
    for (let ms = endMs - TRAIL_MS; ms <= endMs; ms += TRAIL_STEP_MS) {
      const point = positionAt(position, ms);
      if (point) points.push(point);
    }
    return points;
  }, false);

  return viewer.entities.add({
    id: `trail-${norad}`,
    polyline: {
      positions,
      width: 2,
      arcType: Cesium.ArcType.NONE,
      material: Cesium.Color.fromCssColorString(color).withAlpha(0.5),
    },
  });
}

/** Add the moving satellite + its ground track. Returns the runtime handles. */
export function addSatellite(viewer: Viewer, e: SatelliteEphemeris, t0: number, t1: number): SatelliteRuntime {
  const grid = sampleGrid(e, t0, t1);
  const position = fillPosition(grid);
  const color = Cesium.Color.fromCssColorString(e.view.color);

  const entity = viewer.entities.add({
    id: `sat-${e.view.norad}`,
    name: e.view.name,
    position,
    orientation: new Cesium.VelocityOrientationProperty(position),
    point: {
      pixelSize: 4.5,
      color,
      outlineColor: Cesium.Color.WHITE.withAlpha(0.55),
      outlineWidth: 1,
      heightReference: Cesium.HeightReference.NONE,
    },
    label: {
      text: e.view.name,
      font: '600 10px Inter, system-ui, sans-serif',
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(9, -8),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#0a1420').withAlpha(0.7),
      backgroundPadding: new Cesium.Cartesian2(5, 3),
      scale: 0.85,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 7_000_000),
    },
  });

  const track = addGroundTrack(viewer, grid, e.view.norad, e.view.color);
  const trail = addTrail(viewer, position, e.view.norad, e.view.color);

  return {
    id: entity.id ?? `sat-${e.view.norad}`,
    norad: e.view.norad,
    name: e.view.name,
    color: e.view.color,
    entity,
    track,
    trail,
    position,
  };
}

/** ECEF position (metres) at an absolute time, or null when outside the grid. */
export function positionAt(prop: SampledPositionProperty, tMs: number): Cartesian3 | undefined {
  return prop.getValue(Cesium.JulianDate.fromDate(new Date(tMs)));
}
