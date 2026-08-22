/**
 * Renders acquisition footprints and animates the live SAR sweep.
 *
 * - Planned (active) footprints: pickable polygons, one entity per outer ring
 *   (antimeridian splits stay on the correct side of the date line).
 * - Past acquisitions: a single batched point cloud at footprint centroids —
 *   cheap and dense, reads as *completed* coverage.
 * - The active acquisition is swept: its tangent-plane bands fill in with the
 *   satellite color as the clock crosses it, with a beam from the spacecraft to
 *   the leading edge (spec §10.3, §13).
 */
import type {
  Cartesian3,
  Color,
  Entity,
  JulianDate,
  PointPrimitiveCollection,
  Viewer,
} from 'cesium';
import type { SatRec } from 'satellite.js';
import type { Acquisition, PastPoint } from '../../scripts/data/model.ts';
import { poseAt } from '../../scripts/data/ephemeris.ts';
import { localFrameFromPose } from '../../scripts/data/slicing.ts';
import { projectPoint } from '../lib/geometry.ts';
import { Slicer, type SliceResult } from '../lib/slicer.ts';
import { INGEST } from '../../scripts/data/constants.ts';

// Warm accent family: pops against the desaturated navy oceans (spec §5.3) and
// stays clear of the satellite hues (teal / violet / amber).
const PLANNED_FILL = Cesium.Color.fromCssColorString('#ffb454').withAlpha(0.15);
const PLANNED_LINE = Cesium.Color.fromCssColorString('#ffb454').withAlpha(0.5);
const SELECT_FILL = Cesium.Color.fromCssColorString('#fff3d6').withAlpha(0.2);
const SELECT_LINE = Cesium.Color.fromCssColorString('#fff3d6').withAlpha(0.9);
const PAST_DOT = Cesium.Color.fromCssColorString('#37d6a1').withAlpha(0.55);

interface SweepState {
  acq: Acquisition;
  rec: SatRec;
  origin: [number, number];
  axis: [number, number];
  params: NonNullable<SliceResult['params']>;
  bands: Entity[];
  beam: Entity;
  color: Color;
}

export interface LeadingEdge {
  min: Cartesian3;
  center: Cartesian3;
  max: Cartesian3;
}

export class AcquisitionRenderer {
  private viewer: Viewer;
  private acqs = new Map<string, Acquisition>();
  private ringIds = new Map<string, string[]>();
  private past: PointPrimitiveCollection | null = null;
  private selected: string | null = null;
  private sweep: SweepState | null = null;
  private sweepSeq = 0;
  private curtainPos = [
    new Cesium.Cartesian3(0, 0, 0),
    new Cesium.Cartesian3(0, 0, 0),
    new Cesium.Cartesian3(0, 0, 0),
  ];
  private slicer = new Slicer();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /* --------------------------------- planned ----------------------------- */

  addPlanned(acqs: Acquisition[]): void {
    for (const a of acqs) this.addPlannedAcq(a);
  }

  private addPlannedAcq(a: Acquisition, selected = false): void {
    const fill = selected ? SELECT_FILL : PLANNED_FILL;
    const line = selected ? SELECT_LINE : PLANNED_LINE;
    const outline = selected || a.footprint.length > 1;
    const ids: string[] = [];
    a.footprint.forEach((ring, i) => {
      const id = `acq-${a.id}-${i}`;
      this.viewer.entities.removeById(id); // rebuild-safe
      const positions = ring.map((p) => Cesium.Cartesian3.fromDegrees(p[0], p[1], 0));
      this.viewer.entities.add({
        id,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: fill,
          perPositionHeight: false,
          height: 2,
          outline,
          outlineColor: line,
          outlineWidth: 1,
        },
      });
      ids.push(id);
    });
    this.acqs.set(a.id, a);
    this.ringIds.set(a.id, ids);
  }

  removeAcq(id: string): void {
    for (const rid of this.ringIds.get(id) ?? []) this.viewer.entities.removeById(rid);
    this.acqs.delete(id);
    this.ringIds.delete(id);
  }

  /* ---------------------------------- past ------------------------------- */

  addPast(points: PastPoint[]): void {
    const collection = this.viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection({})) as PointPrimitiveCollection;
    // 5,000 evenly-strided dots still read as "dotted recent coverage" (~1.5M km² spacing)
    const MAX = 5000;
    const stride = Math.max(1, Math.ceil(points.length / MAX));
    let added = 0;
    let i = 0;
    for (const p of points) {
      if (i % stride === 0 && p.centroid) {
        collection.add({
          position: Cesium.Cartesian3.fromDegrees(p.centroid[0], p.centroid[1], 0),
          pixelSize: 2,
          color: PAST_DOT,
        });
        added++;
      }
      i++;
    }
    console.log(`[rcm] addPast: fed ${points.length} rows, rendered ${added} dots (stride ${stride})`);
    this.past = collection;
  }

  /* ------------------------------- selection ----------------------------- */

  highlight(id: string | null): void {
    if (this.selected && this.selected !== id) this.refreshRings(this.selected, false);
    this.selected = id;
    if (id) this.refreshRings(id, true);
  }

  /** Rebuild an acquisition's ring entities in the given style (mutate-by-rebuild,
   *  since entity graphic instance properties are Property-typed, not raw values). */
  private refreshRings(id: string, selected: boolean): void {
    const a = this.acqs.get(id);
    if (!a) return;
    this.addPlannedAcq(a, selected);
  }

  /** Hits-test a client (window) coordinate. Returns the acquisition id or null. */
  pick(clientX: number, clientY: number): string | null {
    const picked = this.viewer.scene.pick(new Cesium.Cartesian2(clientX, clientY));
    if (!picked) return null;
    const eid = (picked as { id?: unknown }).id;
    if (typeof eid !== 'string' || !eid.startsWith('acq-')) return null;
    const m = eid.match(/^acq-(.+)-\d+$/);
    return m ? m[1] : null;
  }

  getAcq(id: string): Acquisition | undefined {
    return this.acqs.get(id);
  }

  /** Reveal a single planned footprint (idempotent). */
  revealAcq(a: Acquisition, selected = false): void {
    this.addPlannedAcq(a, selected);
  }

  has(id: string): boolean {
    return this.acqs.has(id);
  }

  /** Toggle the completed-coverage point cloud. */
  setPastVisible(visible: boolean): void {
    if (this.past) this.past.show = visible;
  }

  /* --------------------------------- sweep ------------------------------- */

  /** Build sweep bands when an acquisition becomes the active one. */
  async prepareSweep(acq: Acquisition, rec: SatRec, satColor: string): Promise<void> {
    this.clearSweep();
    const seq = ++this.sweepSeq;
    const mid = (acq.startMs + acq.endMs) / 2;
    const pose = poseAt(rec, mid);
    if (!pose) return;
    const { origin, axis } = localFrameFromPose(pose);
    const n = INGEST.sliceCount;
    const res =
      (await this.slicer.slice(acq.footprint, origin, axis, n)) ??
      this.slicer.computeSlices(acq.footprint, origin, axis, n);
    if (!res || res.params == null) return;
    if (seq !== this.sweepSeq) return; // superseded by a newer sweep

    const color = Cesium.Color.fromCssColorString(satColor);
    const bands: Entity[] = res.slices.map((ring) => {
      const positions = ring.map((p) => Cesium.Cartesian3.fromDegrees(p[0], p[1], 0));
      const ent = this.viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: color.withAlpha(0.32),
          perPositionHeight: false,
          height: 3,
          outline: false,
        },
      });
      ent.show = false;
      return ent;
    });

    const curve = new Cesium.CallbackProperty((time: JulianDate | undefined): Cartesian3[] => {
      if (time) this.fillCurtain(time);
      return this.curtainPos;
    }, false);
    const beam = this.viewer.entities.add({
      polyline: {
        positions: curve,
        width: 1.5,
        material: color.withAlpha(0.9),
      },
    });

    this.sweep = { acq, rec, origin, axis, params: res.params, bands, beam, color };
  }

  private fillCurtain(time: JulianDate): void {
    const s = this.sweep;
    if (!s) return;
    const tMs = Cesium.JulianDate.toDate(time).getTime();
    const edge = this.leadingEdgeAt(s.acq.id, tMs);
    if (!edge) return;
    const pose = poseAt(s.rec, tMs);
    Cesium.Cartesian3.clone(edge.min, this.curtainPos[0]);
    if (pose) {
      this.curtainPos[1].x = pose.pos[0];
      this.curtainPos[1].y = pose.pos[1];
      this.curtainPos[1].z = pose.pos[2];
    } else {
      this.curtainPos[1].x = 0;
      this.curtainPos[1].y = 0;
      this.curtainPos[1].z = 0;
    }
    Cesium.Cartesian3.clone(edge.max, this.curtainPos[2]);
  }

  /** Ground target shared by the sweep curtain and acquisition camera. */
  leadingEdgeAt(id: string, tMs: number): LeadingEdge | null {
    const s = this.sweep;
    if (!s || s.acq.id !== id) return null;
    const span = s.acq.endMs - s.acq.startMs;
    const prog = span > 0 ? Math.min(1, Math.max(0, (tMs - s.acq.startMs) / span)) : 0;
    const tLead = s.params.tMin + prog * (s.params.tMax - s.params.tMin);
    const leadMin = projectPoint([tLead, s.params.cMin], s.origin, s.axis);
    const leadCenter = projectPoint([tLead, (s.params.cMin + s.params.cMax) / 2], s.origin, s.axis);
    const leadMax = projectPoint([tLead, s.params.cMax], s.origin, s.axis);
    return {
      min: Cesium.Cartesian3.fromDegrees(leadMin[0], leadMin[1], 0),
      center: Cesium.Cartesian3.fromDegrees(leadCenter[0], leadCenter[1], 0),
      max: Cesium.Cartesian3.fromDegrees(leadMax[0], leadMax[1], 0),
    };
  }

  /** Reveal sweep bands up to the current progress fraction. */
  fillProgress(tMs: number): void {
    const s = this.sweep;
    if (!s) return;
    const span = s.acq.endMs - s.acq.startMs;
    const prog = span > 0 ? Math.min(1, Math.max(0, (tMs - s.acq.startMs) / span)) : 0;
    const k = Math.round(prog * s.bands.length);
    for (let i = 0; i < s.bands.length; i++) s.bands[i].show = i < k;
  }

  clearSweep(): void {
    this.sweepSeq++;
    const s = this.sweep;
    if (s) {
      for (const b of s.bands) this.viewer.entities.remove(b);
      this.viewer.entities.remove(s.beam);
      this.sweep = null;
    }
  }

  stopSweep(id: string): void {
    if (this.sweep && this.sweep.acq.id === id) this.clearSweep();
  }
}
