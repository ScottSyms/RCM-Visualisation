import { describe, expect, it } from 'vitest';
import {
  buildPlaybackUrl,
  clampTimestamp,
  formatUtcInput,
  parseUtcTimestamp,
  resolvePlaybackStart,
} from '../src/lib/playback-time.ts';

describe('playback timestamps', () => {
  it('parses explicit UTC and offset timestamps', () => {
    const expected = Date.parse('2026-09-08T16:49:00Z');
    expect(parseUtcTimestamp('2026-09-08T16:49:00Z')).toBe(expected);
    expect(parseUtcTimestamp('2026-09-08T12:49:00-04:00')).toBe(expected);
  });

  it('treats zone-less date-time input as UTC', () => {
    expect(parseUtcTimestamp('2026-09-08T16:49:00')).toBe(
      Date.parse('2026-09-08T16:49:00Z'),
    );
  });

  it('rejects missing and invalid timestamps', () => {
    expect(parseUtcTimestamp(null)).toBeNull();
    expect(parseUtcTimestamp('')).toBeNull();
    expect(parseUtcTimestamp('not-a-time')).toBeNull();
  });

  it('falls back for invalid values and clamps values to the mission window', () => {
    expect(resolvePlaybackStart('invalid', 150, 100, 200)).toBe(150);
    expect(resolvePlaybackStart('1970-01-01T00:00:00Z', 150, 100, 200)).toBe(100);
    expect(resolvePlaybackStart('1970-01-01T00:00:01Z', 150, 100, 200)).toBe(200);
    expect(clampTimestamp(175, 100, 200)).toBe(175);
  });

  it('formats a UTC value for a datetime-local field', () => {
    expect(formatUtcInput(Date.parse('2026-09-08T16:49:00.123Z'))).toBe('2026-09-08T16:49:00');
  });

  it('builds a shareable URL while preserving other parameters and the hash', () => {
    const timestamp = Date.parse('2026-09-08T16:49:00Z');
    expect(buildPlaybackUrl('https://example.com/view?rcm=noglobe#scene', timestamp)).toBe(
      'https://example.com/view?rcm=noglobe&start=2026-09-08T16%3A49%3A00.000Z#scene',
    );
  });
});
