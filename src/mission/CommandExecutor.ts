/**
 * Applies a `CommandIntent` (from the AI command bar) to mission state and
 * returns a short human-readable confirmation for the command bar UI.
 *
 * Takes a structural subset of MissionController rather than the concrete
 * class, so intent dispatch is testable with a plain mock instead of a real
 * Cesium viewer — MissionController already satisfies this shape.
 */
import { get, type Readable } from 'svelte/store';
import { fmtUtc } from '../lib/format.ts';
import type { CommandIntent } from './types.ts';
import type { CameraMode, SatelliteView, DiagnosticLine } from './types.ts';

export interface CommandTarget {
  clock: { nowMs: number };
  playing: Readable<boolean>;
  selectedSat: Readable<number | null>;
  satviews(): SatelliteView[];
  selectSat(norad: number | null): void;
  selectAcq(id: string | null): void;
  setSatFilter(sats: Set<string>): void;
  setPlannedVisible(b: boolean): void;
  setPastVisible(b: boolean): void;
  setTrackVisible(b: boolean): void;
  setMode(mode: CameraMode): void;
  togglePlay(): void | Promise<void>;
  setSpeed(m: number): void;
  seek(ms: number): void;
  log(level: DiagnosticLine['level'], text: string): void;
}

const LAYER_LABEL: Record<'planned' | 'past' | 'groundTrack', string> = {
  planned: 'planned footprints',
  past: 'historical coverage',
  groundTrack: 'ground tracks',
};

export function applyCommandIntent(target: CommandTarget, intent: CommandIntent): string {
  switch (intent.type) {
    case 'selectSatellite': {
      const sat = target.satviews().find((s) => s.name === intent.satellite);
      if (!sat) return `${intent.satellite} not found`;
      target.selectSat(sat.norad);
      return `Selected ${intent.satellite}`;
    }
    case 'clearSelection':
      target.selectSat(null);
      target.selectAcq(null);
      return 'Selection cleared';
    case 'setSatelliteFilter':
      target.setSatFilter(new Set(intent.satellites));
      return intent.satellites.length > 0 ? `Filtering to ${intent.satellites.join(', ')}` : 'Showing all satellites';
    case 'setLayerVisible':
      if (intent.layer === 'planned') target.setPlannedVisible(intent.visible);
      else if (intent.layer === 'past') target.setPastVisible(intent.visible);
      else target.setTrackVisible(intent.visible);
      return `${intent.visible ? 'Showing' : 'Hiding'} ${LAYER_LABEL[intent.layer]}`;
    case 'setCameraMode': {
      let norad = get(target.selectedSat);
      if (intent.mode === 'follow') {
        if (intent.satellite) {
          const sat = target.satviews().find((s) => s.name === intent.satellite);
          if (sat) {
            target.selectSat(sat.norad);
            norad = sat.norad;
          }
        }
        if (norad == null) return 'Select a satellite first';
      }
      target.setMode(intent.mode);
      if (intent.mode === 'follow') {
        const name = target.satviews().find((s) => s.norad === norad)?.name ?? '';
        return `Following ${name}`;
      }
      return 'Overview camera';
    }
    case 'setPlaying':
      if (get(target.playing) !== intent.playing) void target.togglePlay();
      return intent.playing ? 'Playing' : 'Paused';
    case 'setSpeed':
      target.setSpeed(intent.multiplier);
      return `Speed ${intent.multiplier}×`;
    case 'seek':
      target.seek(intent.ms);
      return `Jumped to ${fmtUtc(intent.ms)}`;
    case 'seekRelative': {
      target.seek(target.clock.nowMs + intent.deltaSeconds * 1000);
      const minutes = Math.round(Math.abs(intent.deltaSeconds) / 60);
      return `${intent.deltaSeconds >= 0 ? 'Forward' : 'Back'} ${minutes} min`;
    }
    case 'seekNow':
      target.seek(Date.now());
      return 'Jumped to now';
    case 'unrecognized':
      target.log('warn', `command bar: unrecognized — ${intent.reason}`);
      return intent.reason || "Didn't understand that command";
  }
}
