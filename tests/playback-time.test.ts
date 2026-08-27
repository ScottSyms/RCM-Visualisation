import { describe, expect, it } from 'vitest';
import {
  buildPlaybackUrl,
  buildPlaybackWindowUrl,
  clampTimestamp,
  formatUtcInput,
  parseUtcTimestamp,
  resolvePlaybackStart,
  resolvePlaybackWindow,
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

  it('builds a playback window URL with start and end', () => {
    expect(
      buildPlaybackWindowUrl('https://example.com/view#scene', 100, 200),
    ).toBe('https://example.com/view?start=1970-01-01T00%3A00%3A00.100Z&end=1970-01-01T00%3A00%3A00.200Z#scene');
  });

  it('resolves a playback window with clamp and swap', () => {
    const winStart = 0;
    const winEnd = 60_000;
    expect(resolvePlaybackWindow('1970-01-01T00:00:10Z', '1970-01-01T00:00:20Z', 150, winStart, winEnd)).toEqual({
      startMs: Date.parse('1970-01-01T00:00:10Z'),
      endMs: Date.parse('1970-01-01T00:00:20Z'),
    });
    // end before start -> end clamped to start
    expect(resolvePlaybackWindow('1970-01-01T00:00:20Z', '1970-01-01T00:00:10Z', 150, winStart, winEnd)).toEqual({
      startMs: Date.parse('1970-01-01T00:00:20Z'),
      endMs: Date.parse('1970-01-01T00:00:20Z'),
    });
    // out-of-window clamped
    expect(resolvePlaybackWindow('1969-12-31T23:59:00Z', '1970-01-01T01:00:00Z', 150, winStart, winEnd)).toEqual({
      startMs: winStart,
      endMs: winEnd,
    });
    // invalid falls back
    expect(resolvePlaybackWindow('bad', null, 150, winStart, winEnd)).toEqual({ startMs: 150, endMs: winEnd });
  });

  it('includes end in shareable URL when provided', () => {
    const start = Date.parse('2026-09-08T16:49:00Z');
    const end = Date.parse('2026-09-10T00:00:00Z');
    expect(buildPlaybackUrl('https://example.com/view', start, end)).toBe(
      'https://example.com/view?start=2026-09-08T16%3A49%3A00.000Z&end=2026-09-10T00%3A00%3A00.000Z',
    );
  });
});
