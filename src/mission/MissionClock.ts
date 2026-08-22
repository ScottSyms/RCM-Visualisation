/**
 * A scrub-safe mission clock built on the Cesium scene clock. Owns the time
 * window, playback state, and speed; reports current mission time in ms. The
 * Cesium clock drives all ephemeris / position sampling, so a single
 * `clock.currentTime` keeps satellites, sweep, and camera in lockstep.
 */
import type { Viewer } from 'cesium';

export class MissionClock {
  private viewer: Viewer;
  private multiplier = 60;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  private get clock() {
    return this.viewer.clock;
  }

  setWindow(startMs: number, endMs: number, seedMs: number): void {
    const c = this.clock;
    c.startTime = Cesium.JulianDate.fromDate(new Date(startMs));
    c.stopTime = Cesium.JulianDate.fromDate(new Date(endMs));
    c.currentTime = Cesium.JulianDate.fromDate(new Date(clamp(seedMs, startMs, endMs)));
    c.clockRange = Cesium.ClockRange.LOOP_STOP;
    c.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    c.multiplier = this.multiplier;
  }

  get startTimeMs(): number {
    return Cesium.JulianDate.toDate(this.clock.startTime).getTime();
  }

  get stopTimeMs(): number {
    return Cesium.JulianDate.toDate(this.clock.stopTime).getTime();
  }

  get nowMs(): number {
    return Cesium.JulianDate.toDate(this.clock.currentTime).getTime();
  }

  get playing(): boolean {
    return this.clock.shouldAnimate;
  }

  setPlaying(playing: boolean): void {
    this.clock.shouldAnimate = playing;
  }

  get speed(): number {
    return this.multiplier;
  }

  setSpeed(m: number): void {
    this.multiplier = m;
    this.clock.multiplier = m;
  }

  seek(ms: number): void {
    this.clock.currentTime = Cesium.JulianDate.fromDate(
      new Date(clamp(ms, this.startTimeMs, this.stopTimeMs)),
    );
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
