import { describe, expect, it } from 'vitest';
import { loadD1ConfigFromEnv, rowToAcquisition } from '../scripts/data/archive.ts';
import type { Acquisition } from '../scripts/data/model.ts';

describe('loadD1ConfigFromEnv', () => {
  it('returns null when any credential is missing', () => {
    expect(loadD1ConfigFromEnv({})).toBeNull();
    expect(loadD1ConfigFromEnv({ CF_ACCOUNT_ID: 'a', CF_D1_DATABASE_ID: 'b' })).toBeNull();
  });

  it('returns the config when all three are set', () => {
    expect(
      loadD1ConfigFromEnv({ CF_ACCOUNT_ID: 'a', CF_D1_DATABASE_ID: 'b', CF_API_TOKEN: 'c' }),
    ).toEqual({ accountId: 'a', databaseId: 'b', apiToken: 'c' });
  });
});

describe('rowToAcquisition', () => {
  it('round-trips a D1 row back into an Acquisition (schema stays in sync)', () => {
    const acquisition: Acquisition = {
      id: 'past-109308',
      kind: 'past',
      satid: 'RCM-1',
      beam: 'Low Resolution 100m',
      beamId: 'SC100MHVA',
      pol: 'H+V',
      polType: 'Dual HH-VV Polarization',
      ccd: 'FALSE',
      product: 'GRD - 16bit',
      radarMode: 'ScanSAR',
      startMs: 1_756_785_113_000,
      endMs: 1_756_785_159_000,
      footprint: [
        [
          [120, 50],
          [130, 50],
          [130, 60],
          [120, 60],
          [120, 50],
        ],
      ],
      centroid: [125, 55],
    };
    // Shape D1 hands back: TEXT columns as strings, footprint as its stored JSON string.
    const row = {
      id: acquisition.id,
      kind: acquisition.kind,
      satid: acquisition.satid,
      beam: acquisition.beam,
      beamId: acquisition.beamId,
      pol: acquisition.pol,
      polType: acquisition.polType,
      ccd: acquisition.ccd,
      product: acquisition.product,
      radarMode: acquisition.radarMode,
      startMs: acquisition.startMs,
      endMs: acquisition.endMs,
      footprint: JSON.stringify(acquisition.footprint),
      centroidLon: acquisition.centroid![0],
      centroidLat: acquisition.centroid![1],
      updatedAt: Date.now(),
    };
    expect(rowToAcquisition(row)).toEqual(acquisition);
  });

  it('maps a null centroid pair back to null', () => {
    const row = {
      id: 'planned-1',
      kind: 'planned',
      satid: 'RCM-2',
      beam: '',
      beamId: '',
      pol: '',
      polType: '',
      ccd: '',
      product: '',
      radarMode: '',
      startMs: 0,
      endMs: 1,
      footprint: '[]',
      centroidLon: null,
      centroidLat: null,
      updatedAt: 0,
    };
    expect(rowToAcquisition(row).centroid).toBeNull();
  });
});
