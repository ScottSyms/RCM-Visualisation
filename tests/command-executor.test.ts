import { describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { applyCommandIntent, type CommandTarget } from '../src/mission/CommandExecutor.ts';
import type { CommandIntent, SatelliteView } from '../src/mission/types.ts';

const SATS: SatelliteView[] = [
  { norad: 44322, name: 'RCM-1', intl: '2019-033A', epochMs: 0, color: '#fff', inclination: 97.8 },
  { norad: 44324, name: 'RCM-2', intl: '2019-033B', epochMs: 0, color: '#fff', inclination: 97.8 },
];

/** Fresh spies for every test, plus a CommandTarget wired to them; assert on the spies directly. */
function makeTarget() {
  const spies = {
    selectSat: vi.fn(),
    selectAcq: vi.fn(),
    setSatFilter: vi.fn(),
    setPlannedVisible: vi.fn(),
    setPastVisible: vi.fn(),
    setTrackVisible: vi.fn(),
    setMode: vi.fn(),
    togglePlay: vi.fn(),
    setSpeed: vi.fn(),
    seek: vi.fn(),
    log: vi.fn(),
  };
  const playing = writable(false);
  const selectedSat = writable<number | null>(null);
  const target: CommandTarget = {
    clock: { nowMs: 1_000_000 },
    playing,
    selectedSat,
    satviews: () => SATS,
    ...spies,
  };
  return { target, playing, selectedSat, ...spies };
}

describe('applyCommandIntent', () => {
  it('selectSatellite selects by norad and reports the name', () => {
    const t = makeTarget();
    const msg = applyCommandIntent(t.target, { type: 'selectSatellite', satellite: 'RCM-2' });
    expect(t.selectSat).toHaveBeenCalledWith(44324);
    expect(msg).toContain('RCM-2');
  });

  it('selectSatellite reports an unknown satellite without dispatching', () => {
    const t = makeTarget();
    const msg = applyCommandIntent(t.target, { type: 'selectSatellite', satellite: 'RCM-3' });
    expect(t.selectSat).not.toHaveBeenCalled();
    expect(msg).toContain('not found');
  });

  it('clearSelection deselects both satellite and acquisition', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'clearSelection' });
    expect(t.selectSat).toHaveBeenCalledWith(null);
    expect(t.selectAcq).toHaveBeenCalledWith(null);
  });

  it('setSatelliteFilter forwards the set, and reports "all" for an empty list', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'setSatelliteFilter', satellites: ['RCM-1'] });
    expect(t.setSatFilter).toHaveBeenCalledWith(new Set(['RCM-1']));
    const msg = applyCommandIntent(t.target, { type: 'setSatelliteFilter', satellites: [] });
    expect(msg).toMatch(/all/i);
  });

  it('setLayerVisible routes to the matching controller method per layer', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'setLayerVisible', layer: 'planned', visible: true });
    expect(t.setPlannedVisible).toHaveBeenCalledWith(true);
    applyCommandIntent(t.target, { type: 'setLayerVisible', layer: 'past', visible: false });
    expect(t.setPastVisible).toHaveBeenCalledWith(false);
    applyCommandIntent(t.target, { type: 'setLayerVisible', layer: 'groundTrack', visible: true });
    expect(t.setTrackVisible).toHaveBeenCalledWith(true);
  });

  it('setCameraMode "follow" with a named satellite selects it first, then follows', () => {
    const t = makeTarget();
    const msg = applyCommandIntent(t.target, { type: 'setCameraMode', mode: 'follow', satellite: 'RCM-1' });
    expect(t.selectSat).toHaveBeenCalledWith(44322);
    expect(t.setMode).toHaveBeenCalledWith('follow');
    expect(msg).toContain('RCM-1');
  });

  it('setCameraMode "follow" with nothing selected and no satellite named refuses', () => {
    const t = makeTarget();
    const msg = applyCommandIntent(t.target, { type: 'setCameraMode', mode: 'follow' });
    expect(t.setMode).not.toHaveBeenCalled();
    expect(msg).toMatch(/select a satellite/i);
  });

  it('setCameraMode "follow" reuses an already-selected satellite', () => {
    const t = makeTarget();
    t.selectedSat.set(44324);
    applyCommandIntent(t.target, { type: 'setCameraMode', mode: 'follow' });
    expect(t.setMode).toHaveBeenCalledWith('follow');
  });

  it('setPlaying only calls togglePlay when the state actually needs to change', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'setPlaying', playing: false });
    expect(t.togglePlay).not.toHaveBeenCalled();
    applyCommandIntent(t.target, { type: 'setPlaying', playing: true });
    expect(t.togglePlay).toHaveBeenCalledOnce();
  });

  it('setSpeed forwards the multiplier', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'setSpeed', multiplier: 300 });
    expect(t.setSpeed).toHaveBeenCalledWith(300);
  });

  it('seek forwards the absolute ms', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'seek', ms: 1_700_000_000_000 });
    expect(t.seek).toHaveBeenCalledWith(1_700_000_000_000);
  });

  it('seekRelative adds the delta to the current mission clock', () => {
    const t = makeTarget();
    applyCommandIntent(t.target, { type: 'seekRelative', deltaSeconds: 3600 });
    expect(t.seek).toHaveBeenCalledWith(1_000_000 + 3_600_000);
  });

  it('unrecognized logs a warning and surfaces the reason', () => {
    const t = makeTarget();
    const intent: CommandIntent = { type: 'unrecognized', reason: 'no matching action' };
    const msg = applyCommandIntent(t.target, intent);
    expect(t.log).toHaveBeenCalledWith('warn', expect.stringContaining('no matching action'));
    expect(msg).toBe('no matching action');
  });
});
