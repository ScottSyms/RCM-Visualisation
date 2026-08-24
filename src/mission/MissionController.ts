/**
 * The mission's central controller: owns the Cesium scene's data + scene state and
 * exposes Svelte stores so the UI (App, timeline, drawer, cards, diagnostics) can
 * react and dispatch. All time is driven by a single Cesium clock; every second,
 * the controller advances the following sweep, camera tracking, and the active
 * acquisition.
 */
import { get, writable } from 'svelte/store';
import type { Viewer } from 'cesium';
import type { Acquisition, Manifest, PastPoint, Satellite } from '../../scripts/data/model.ts';
import { buildEphemerides, type SatelliteEphemeris } from '../ephemeris/EphemerisLoader.ts';
import { addSatellite, positionAt, type SatelliteRuntime } from '../ephemeris/SatelliteEntity.ts';
import { styleEarth } from '../cesium/EarthStyle.ts';
import { AcquisitionRenderer } from '../cesium/AcquisitionRenderer.ts';
import { CameraController } from '../cesium/CameraController.ts';
import { MissionClock } from './MissionClock.ts';
import type { CameraMode, SatelliteView, DiagnosticLine } from './types.ts';
import type { SatRec } from 'satellite.js';
import { debugFlags } from '../lib/debug-flags.ts';

export type Phase = 'idle' | 'loading' | 'ready' | 'error';

export interface MissionData {
  manifest: Manifest;
  satellites: Satellite[];
  planned: Acquisition[];
  past: PastPoint[];
}

/**
 * Rolling window (ms) around mission time within which planned footprints are
 * *drawn*. Rendering the whole two-week plan (thousands of entity polygons) at
 * boot exceeds the buffer allocation Cesium's instanced entity pipeline can
 * back, so the scene shows [now-6h, now+48h] and scrolls with the clock
 * (~1.3k entities steady state). The selected acquisition is always pinned.
 */
const PLAN_AHEAD_MS = 48 * 3_600_000;
const PLAN_BACK_MS = 6 * 3_600_000;
const RECENT_HIGHLIGHT_MS = 6 * 3_600_000;
const SATELLITE_VIEW_LOOKAHEAD_MS = 100 * 60_000;

export class MissionController {
  private viewer: Viewer;
  private renderer: AcquisitionRenderer;
  private camera: CameraController;
  clock: MissionClock;

  phase = writable<Phase>('idle');
  nowMs = writable(0);
  playing = writable(false);
  speed = writable(60);
  mode = writable<CameraMode>('overview');
  selectedAcq = writable<string | null>(null);
  selectedSat = writable<number | null>(null);
  showPlanned = writable(false);
  showPast = writable(false);
  track = writable(false);
  satelliteViewHeightKm = writable(3_000);
  satelliteViewSat = writable<number | null>(null);
  satFilter = writable<Set<string>>(new Set());
  diagnostics = writable<DiagnosticLine[]>([]);

  satellites: SatelliteRuntime[] = [];
  ephems: SatelliteEphemeris[] = [];
  private recByName = new Map<string, SatRec>();
  private colorByName = new Map<string, string>();
  private plannedCache: Acquisition[] = [];
  private byId = new Map<string, Acquisition>();
  private pastCache: PastPoint[] = [];
  private manifest: Manifest | null = null;
  private shown = new Set<string>();
  private activeId: string | null = null;
  private lastActive: { id: string; endMs: number } | null = null;
  private autoSelected = false;
  private lastActiveCheck = 0;
  private cameraSatName: string | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.renderer = new AcquisitionRenderer(viewer);
    this.camera = new CameraController(viewer);
    this.clock = new MissionClock(viewer);
  }

  log(level: DiagnosticLine['level'], text: string): void {
    const lines = get(this.diagnostics);
    const next = [...lines, { at: Date.now(), level, text }];
    if (next.length > 200) next.splice(0, next.length - 200);
    this.diagnostics.set(next);
  }

  /* ------------------------------ bootstrap ----------------------------- */

  async build(
    data: MissionData,
    ephPackage: unknown,
    windowMs: { startMs: number; endMs: number; seedMs: number },
  ): Promise<void> {
    this.phase.set('loading');
    this.log('info', `build: ${data.planned.length} planned, ${data.past.length} past`);
    this.manifest = data.manifest;
    this.plannedCache = data.planned;
    this.byId = new Map(data.planned.map((a) => [a.id, a]));
    this.pastCache = data.past;

    if (!debugFlags.noglobe) await styleEarth(this.viewer);

    this.ephems = buildEphemerides(data.satellites);
    for (const e of this.ephems) {
      this.recByName.set(e.view.name, e.rec);
      this.colorByName.set(e.view.name, e.view.color);
    }

    // Satellites (SGP4 over the window)
    for (const e of this.ephems) {
      this.satellites.push(addSatellite(this.viewer, e, windowMs.startMs, windowMs.endMs));
    }
    this.setTrackVisible(get(this.track));

    // Past coverage (dot cloud) — hidden by default, synced with the store
    if (!debugFlags.nopast && !debugFlags.nodots) {
      this.renderer.addPast(this.pastCache);
      this.renderer.setPastVisible(get(this.showPast));
    }
    if (debugFlags.noplanes) this.showPlanned.set(false);

    // Clock, then the initial slice of planned footprints (rolling window)
    this.clock.setWindow(windowMs.startMs, windowMs.endMs, windowMs.seedMs);
    this.refreshPlanned(this.clock.nowMs);

    this.phase.set('ready');
    this.log('ok', `ready: ${this.satellites.length} satellites tracked`);
    void ephPackage;
  }

  private recFor(satId: string): SatRec | undefined {
    return this.recByName.get(satId);
  }

  private colorFor(satId: string): string {
    return this.colorByName.get(satId) ?? '#ffffff';
  }

  /* ------------------------------ per-frame ----------------------------- */

  update(): void {
    const t = this.clock.nowMs;
    this.nowMs.set(t);

    // Active acquisition sweep + rolling footprint window (throttled)
    this.syncAtTime(t);
    this.renderer.fillProgress(t);
    this.camera.tick(t, this.viewer.scene.camera);
  }

  private syncAtTime(t: number, force = false): void {
    if (!force && Math.abs(t - this.lastActiveCheck) <= 100) return;
    this.lastActiveCheck = t;
    this.recomputeActive(t);
    this.refreshPlanned(t);
  }

  private recomputeActive(t: number): void {
    let active: Acquisition | null = null;
    let bestMid = Number.POSITIVE_INFINITY;
    if (this.cameraSatName) {
      for (const a of this.plannedCache) {
        if (a.satid !== this.cameraSatName || a.startMs > t || t > a.endMs) continue;
        const mid = (a.startMs + a.endMs) / 2;
        if (Math.abs(mid - t) < bestMid) {
          bestMid = Math.abs(mid - t);
          active = a;
        }
      }
    } else {
      for (const a of this.plannedCache) {
        if (a.startMs <= t && t <= a.endMs) {
          const mid = (a.startMs + a.endMs) / 2;
          if (Math.abs(mid - t) < bestMid) {
            bestMid = Math.abs(mid - t);
            active = a;
          }
        }
      }
    }
    const id = active ? active.id : null;
    if (id === this.activeId) return;
    this.activeId = id;
    if (active) {
      this.lastActive = { id: active.id, endMs: active.endMs };
      const rec = this.recFor(active.satid);
      if (rec) this.renderer.prepareSweep(active, rec, this.colorFor(active.satid));
      this.selectedAcq.set(active.id);
      this.renderer.highlight(active.id);
      this.autoSelected = true;
    } else {
      this.renderer.clearSweep();
    }
  }

  /* ------------------------------- actions ------------------------------ */

  async togglePlay(): Promise<void> {
    const p = !this.clock.playing;
    this.clock.setPlaying(p);
    this.playing.set(p);
    if (p) this.log('info', `playback @ ${this.clock.speed}×`);
  }

  setSpeed(m: number): void {
    this.clock.setSpeed(m);
    this.speed.set(m);
  }

  seek(ms: number): void {
    this.clock.seek(ms);
    const t = this.clock.nowMs;
    this.nowMs.set(t);
    this.syncAtTime(t, true);
  }

  window(): { startMs: number; endMs: number } {
    return { startMs: this.clock.startTimeMs, endMs: this.clock.stopTimeMs };
  }

  setMode(mode: CameraMode): void {
    if (mode === 'overview') {
      if (this.cameraSatName) this.exitAcquisitionView();
      else {
        this.camera.toOverview();
        this.mode.set('overview');
      }
    } else if (mode === 'follow') {
      if (this.cameraSatName) this.exitAcquisitionView(false);
      const sat = this.satellites.find((s) => s.norad === get(this.selectedSat));
      if (sat) {
        this.camera.follow((tMs) => {
          const p = positionAt(sat.position, tMs);
          return p ? [p.x, p.y, p.z] : null;
        });
        this.mode.set('follow');
        this.log('info', `follow ${sat.name}`);
      }
    }
  }

  /** Screen (client) coordinate hits-test. Returns the acquisition id or null. */
  pickAt(clientX: number, clientY: number): string | null {
    return this.renderer.pick(clientX, clientY);
  }

  selectSat(norad: number | null): void {
    this.selectedSat.set(norad);
    if (this.cameraSatName) return;
    if (!norad) {
      if (get(this.mode) === 'follow') {
        this.camera.unfollow();
        this.mode.set('overview');
      }
      return;
    }
    const sat = this.satellites.find((s) => s.norad === norad);
    const f = sat ? satFocus(sat, this.clock.nowMs) : null;
    if (f) {
      this.camera.focus(f);
      this.mode.set('overview');
    }
  }

  selectAcq(id: string | null): void {
    const satelliteView = this.cameraSatName != null;
    this.autoSelected = false; // user selections stay pinned until cleared
    this.selectedAcq.set(id);
    this.refreshPlanned(); // pin the ring even if outside the rolling window
    this.renderer.highlight(id);
    if (!id || satelliteView) return;
    const a = this.renderer.getAcq(id);
    if (a?.centroid) {
      const alt = footprintAlt(a);
      this.camera.focus({ lon: a.centroid[0], lat: a.centroid[1], altM: alt });
      this.mode.set('overview');
    }
  }

  playAcquisition(id: string): void {
    const acq = this.byId.get(id);
    const sat = acq ? this.satellites.find((s) => s.name === acq.satid) : null;
    if (!acq || !sat) {
      this.log('warn', `satellite view unavailable for ${id}`);
      return;
    }

    if (this.cameraSatName || get(this.mode) === 'acquisition') this.exitAcquisitionView(false);

    this.autoSelected = false;
    this.selectedAcq.set(acq.id);
    this.renderer.highlight(acq.id);
    if (!this.activateSatelliteView(sat)) return;
    this.log('info', `satellite view ${sat.name} · schematic`);
  }

  selectSatelliteView(norad: number): void {
    if (get(this.mode) !== 'acquisition') return;
    const sat = this.satellites.find((s) => s.norad === norad);
    if (!sat || sat.name === this.cameraSatName) return;
    if (!this.activateSatelliteView(sat)) return;
    this.log('info', `satellite view switched to ${sat.name}`);
  }

  private activateSatelliteView(sat: SatelliteRuntime): boolean {
    const previous = this.satellites.find((s) => s.name === this.cameraSatName);
    if (previous) {
      previous.trail.show = true;
      previous.track.show = get(this.track);
    }
    this.cameraSatName = sat.name;
    this.satelliteViewSat.set(sat.norad);
    sat.trail.show = false;
    sat.track.show = false;
    this.mode.set('acquisition');
    this.syncAtTime(this.clock.nowMs, true);
    const entered = this.camera.trackSatelliteView(
      {
        satelliteAt: (tMs) => {
          const p = positionAt(sat.position, tMs);
          return p ? [p.x, p.y, p.z] : null;
        },
      },
      this.clock.nowMs,
    );
    if (!entered) {
      this.exitAcquisitionView(false);
      return false;
    }
    return true;
  }

  exitAcquisitionView(flyOverview = true): void {
    if (!this.cameraSatName && get(this.mode) !== 'acquisition') return;
    const sat = this.satellites.find((s) => s.name === this.cameraSatName);
    if (sat) {
      sat.trail.show = true;
      sat.track.show = get(this.track);
    }
    this.cameraSatName = null;
    this.satelliteViewSat.set(null);
    if (flyOverview) this.camera.toOverview();
    else this.camera.cancelDrivenView();
    this.mode.set('overview');
    this.syncAtTime(this.clock.nowMs, true);
  }

  flyToSat(norad: number): void {
    if (this.cameraSatName) this.exitAcquisitionView(false);
    const sat = this.satellites.find((s) => s.norad === norad);
    if (!sat) return;
    const f = satFocus(sat, this.clock.nowMs);
    if (f) {
      this.camera.focus(f);
      this.mode.set('overview');
    }
  }

  flyToAcq(id: string): void {
    if (this.cameraSatName) this.exitAcquisitionView(false);
    this.selectAcq(id);
  }

  async navigateToAcquisition(id: string): Promise<void> {
    const acq = this.byId.get(id);
    if (!acq) return;

    // 1. pause playback
    await this.togglePlay();

    // 2. exit driven camera modes (follow / acquisition view)
    if (this.cameraSatName) this.exitAcquisitionView(false);

    // 3. seek to acquisition start
    this.seek(acq.startMs);

    // 4. pin and highlight the acquisition
    this.selectAcq(id);

    // 5. try to focus the satellite for inspection
    const sat = this.satellites.find((s) => s.name === acq.satid);
    if (sat) {
      const f = satFocus(sat, this.clock.nowMs);
      if (f) {
        this.camera.focus(f);
        this.mode.set('overview');
      }
    }
  }

  /* ------------------------------- filters ------------------------------ */

  setSatFilter(sats: Set<string>): void {
    this.satFilter.set(sats);
    this.refreshPlanned();
  }

  setPlannedVisible(b: boolean): void {
    this.showPlanned.set(b);
    this.refreshPlanned();
  }

  setPastVisible(b: boolean): void {
    this.showPast.set(b);
    this.renderer.setPastVisible(b);
  }

  setTrackVisible(b: boolean): void {
    this.track.set(b);
    for (const s of this.satellites) s.track.show = b && s.name !== this.cameraSatName;
  }

  adjustSatelliteViewHeight(deltaKm: number): void {
    const next = Math.min(3_000, Math.max(500, get(this.satelliteViewHeightKm) + deltaKm));
    this.satelliteViewHeightKm.set(next);
    this.camera.setSatelliteViewHeight(next * 1_000);
  }

  /**
   * Sync the drawn planned entities with: satellite filter AND the rolling
   * time window AND "show planned", plus the pinned selection.
   */
  private refreshPlanned(tMs?: number): void {
    const t = tMs ?? this.clock.nowMs;
    // Release the auto highlight ~6 h after the acquisition ends; user
    // selections stay pinned until explicitly cleared.
    if (this.autoSelected && this.lastActive && t > this.lastActive.endMs + RECENT_HIGHLIGHT_MS) {
      this.autoSelected = false;
      this.selectedAcq.set(null);
      this.renderer.highlight(null);
    }
    const sats = get(this.satFilter);
    const selected = get(this.selectedAcq);
    const show = get(this.showPlanned);
    const lo = t - PLAN_BACK_MS;
    const hi = t + PLAN_AHEAD_MS;

    const want = new Set<string>();
    if (show) {
      for (const a of this.plannedCache) {
        if (a.endMs >= lo && a.startMs <= hi && (sats.size === 0 || sats.has(a.satid))) {
          want.add(a.id);
        }
      }
    }
    if (this.cameraSatName) {
      const viewHi = t + SATELLITE_VIEW_LOOKAHEAD_MS;
      for (const a of this.plannedCache) {
        if (a.satid === this.cameraSatName && a.endMs >= t && a.startMs <= viewHi) {
          want.add(a.id);
        }
      }
    }
    if (selected) want.add(selected);

    for (const id of [...this.shown]) {
      if (!want.has(id)) {
        this.renderer.removeAcq(id);
        this.shown.delete(id);
      }
    }
    for (const id of want) {
      if (this.shown.has(id)) continue;
      const a = this.byId.get(id);
      if (!a) continue;
      this.renderer.revealAcq(a, id === selected);
      this.shown.add(id);
    }
  }

  /* --------------------------------- misc ------------------------------- */

  acquisition(id: string): Acquisition | null {
    return this.renderer.getAcq(id) ?? null;
  }

  plannedList(): Acquisition[] {
    return this.plannedCache;
  }

  satviews(): SatelliteView[] {
    return this.satellites.map((s, i) => ({
      norad: s.norad,
      name: s.name,
      intl: this.ephems[i].view.intl,
      epochMs: this.ephems[i].view.epochMs,
      color: s.color,
      inclination: this.ephems[i].view.inclination,
    }));
  }

  manifest_(): Manifest | null {
    return this.manifest;
  }
}

/* ------------------------------- helpers ------------------------------- */

function satFocus(sat: SatelliteRuntime, tMs: number) {
  const p = positionAt(sat.position, tMs);
  if (!p) return null;
  const geo = Cesium.Cartographic.fromCartesian(p);
  return { lon: Cesium.Math.toDegrees(geo.longitude), lat: Cesium.Math.toDegrees(geo.latitude), altM: 9_000_000, pitch: -Math.PI / 3 };
}

function footprintAlt(a: Acquisition): number {
  // box around the footprint for a framed view
  let lon0 = Infinity, lon1 = -Infinity, lat0 = Infinity, lat1 = -Infinity;
  for (const ring of a.footprint)
    for (const [lon, lat] of ring) {
      if (lon < lon0) lon0 = lon;
      if (lon > lon1) lon1 = lon;
      if (lat < lat0) lat0 = lat;
      if (lat > lat1) lat1 = lat;
    }
  const w = Cesium.Math.toRadians(Math.max(lon1 - lon0, 0.1));
  const km = w * 6371;
  return Math.max(km * 3 + 120_000, 180_000);
}
