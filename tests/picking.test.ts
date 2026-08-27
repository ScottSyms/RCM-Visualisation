import { describe, expect, it } from 'vitest';
import { entityId, parseAcqId, parseSatNorad } from '../src/lib/entity-pick.ts';

describe('entity picking helpers', () => {
  it('extracts entity ids from string and Entity-style picks', () => {
    expect(entityId({ id: 'acq-planned-123-0' })).toBe('acq-planned-123-0');
    expect(entityId({ id: { id: 'acq-planned-999-2' } })).toBe('acq-planned-999-2');
    expect(entityId({ id: 'sat-44322' })).toBe('sat-44322');
    expect(entityId(null)).toBeNull();
  });

  it('parses acquisition ids', () => {
    expect(parseAcqId('acq-planned-123-0')).toBe('planned-123');
    expect(parseAcqId('acq-planned-999-2')).toBe('planned-999');
    expect(parseAcqId('sat-44322')).toBeNull();
  });

  it('parses satellite NORAD ids', () => {
    expect(parseSatNorad('sat-44322')).toBe(44322);
    expect(parseSatNorad('sat-44323')).toBe(44323);
    expect(parseSatNorad('acq-planned-123-0')).toBeNull();
    expect(parseSatNorad('sat-abc')).toBeNull();
  });
});
