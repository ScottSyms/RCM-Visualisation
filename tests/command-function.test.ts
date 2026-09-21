import { describe, expect, it } from 'vitest';
import { toCommandIntent } from '../functions/api/command.ts';

describe('toCommandIntent (server-side re-validation of the model output)', () => {
  it('accepts a well-formed selectSatellite', () => {
    expect(toCommandIntent({ type: 'selectSatellite', satellite: 'RCM-2' })).toEqual({
      type: 'selectSatellite',
      satellite: 'RCM-2',
    });
  });

  it('rejects a satellite name outside the closed RCM-1/2/3 set', () => {
    expect(toCommandIntent({ type: 'selectSatellite', satellite: 'RCM-9' })).toEqual({
      type: 'unrecognized',
      reason: 'no satellite named',
    });
  });

  it('filters an invalid entry out of setSatelliteFilter rather than failing the whole intent', () => {
    expect(toCommandIntent({ type: 'setSatelliteFilter', satellites: ['RCM-1', 'RCM-9'] })).toEqual({
      type: 'setSatelliteFilter',
      satellites: ['RCM-1'],
    });
  });

  it('setLayerVisible requires both a known layer and a boolean visible', () => {
    expect(toCommandIntent({ type: 'setLayerVisible', layer: 'planned', visible: true })).toEqual({
      type: 'setLayerVisible',
      layer: 'planned',
      visible: true,
    });
    expect(toCommandIntent({ type: 'setLayerVisible', layer: 'orbit' })).toMatchObject({ type: 'unrecognized' });
  });

  it('setCameraMode carries an optional satellite through only when valid', () => {
    expect(toCommandIntent({ type: 'setCameraMode', mode: 'follow', satellite: 'RCM-1' })).toEqual({
      type: 'setCameraMode',
      mode: 'follow',
      satellite: 'RCM-1',
    });
    expect(toCommandIntent({ type: 'setCameraMode', mode: 'follow' })).toEqual({
      type: 'setCameraMode',
      mode: 'follow',
      satellite: undefined,
    });
  });

  it('seek parses a valid ISO string to ms and rejects garbage', () => {
    const r = toCommandIntent({ type: 'seek', iso: '2026-09-21T12:00:00Z' });
    expect(r).toEqual({ type: 'seek', ms: Date.parse('2026-09-21T12:00:00Z') });
    expect(toCommandIntent({ type: 'seek', iso: 'not-a-time' })).toMatchObject({ type: 'unrecognized' });
  });

  it('setSpeed rejects a non-positive multiplier', () => {
    expect(toCommandIntent({ type: 'setSpeed', multiplier: 0 })).toMatchObject({ type: 'unrecognized' });
    expect(toCommandIntent({ type: 'setSpeed', multiplier: 60 })).toEqual({ type: 'setSpeed', multiplier: 60 });
  });

  it('falls back to unrecognized for an unknown or missing type', () => {
    expect(toCommandIntent({})).toMatchObject({ type: 'unrecognized' });
    expect(toCommandIntent({ type: 'deleteEverything' })).toMatchObject({ type: 'unrecognized' });
  });

  it('passes an explicit unrecognized reason through', () => {
    expect(toCommandIntent({ type: 'unrecognized', reason: 'asked to find an acquisition by place name' })).toEqual({
      type: 'unrecognized',
      reason: 'asked to find an acquisition by place name',
    });
  });
});
