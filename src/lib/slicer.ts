/**
 * Slices an acquisition footprint into progress bands. Tries the web worker and
 * transparently falls back to synchronous `computeSlices` if the worker cannot be
 * created (e.g. restricted environments).
 */
import { computeSlices } from './geometry.ts';
import type { LonLat, SliceParams, Vec2 } from './geometry.ts';

export interface SliceResult {
  slices: LonLat[][];
  params: SliceParams | null;
}

export class Slicer {
  private worker: Worker | null = null;

  constructor() {
    try {
      this.worker = new Worker(
        new URL('../workers/geometry.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      this.worker = null;
    }
  }

  /** Synchronous, always-available path. */
  computeSlices(rings: LonLat[][], origin: LonLat, axis: Vec2, n: number): SliceResult | null {
    const res = computeSlices(rings, origin, axis, n);
    return res ? { slices: res.slices, params: res.params } : null;
  }

  async slice(rings: LonLat[][], origin: LonLat, axis: Vec2, n: number): Promise<SliceResult | null> {
    const sync = () => this.computeSlices(rings, origin, axis, n);
    const w = this.worker;
    if (!w) return sync();
    return await new Promise<SliceResult | null>((resolve) => {
      const finish = w.removeEventListener.bind(w) as never;
      const timer = setTimeout(() => {
        cleanup();
        resolve(sync());
      }, 2500);
      const onmessage = (e: MessageEvent<SliceResult | null>): void => {
        cleanup();
        resolve(e.data);
      };
      const onerror = (): void => {
        cleanup();
        resolve(sync());
      };
      const cleanup = (): void => {
        w.removeEventListener('message', onmessage);
        w.removeEventListener('error', onerror);
        clearTimeout(timer);
        void finish;
      };
      w.addEventListener('message', onmessage);
      w.addEventListener('error', onerror);
      w.postMessage({ rings, origin, axis, n });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
