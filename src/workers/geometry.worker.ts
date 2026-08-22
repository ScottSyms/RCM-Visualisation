/**
 * Slicing web worker. Computes the tangent-plane band model for an acquisition
 * footprint (spec §10.3) off the main thread. `computeSlices` is pure, so it can
 * run identically in the worker or in the main-thread fallback.
 */
import { computeSlices, type LonLat, type Vec2 } from '../lib/geometry.ts';

interface SliceReq {
  rings: LonLat[][];
  origin: LonLat;
  axis: Vec2;
  n: number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e: MessageEvent<SliceReq>): void => {
  const { rings, origin, axis, n } = e.data;
  const out = computeSlices(rings, origin, axis, n);
  ctx.postMessage(out);
};
