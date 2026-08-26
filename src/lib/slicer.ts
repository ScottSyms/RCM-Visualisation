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

interface SliceResponse {
  id: number;
  result: SliceResult | null;
}

interface PendingSlice {
  resolve: (result: SliceResult | null) => void;
  fallback: () => SliceResult | null;
  timer: ReturnType<typeof setTimeout>;
}

export class Slicer {
  private worker: Worker | null = null;
  private requestSeq = 0;
  private pending = new Map<number, PendingSlice>();

  constructor() {
    try {
      this.worker = new Worker(
        new URL('../workers/geometry.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.addEventListener('message', this.onMessage);
      this.worker.addEventListener('error', this.onError);
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
      const id = ++this.requestSeq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(sync());
      }, 2500);
      this.pending.set(id, { resolve, fallback: sync, timer });
      try {
        w.postMessage({ id, rings, origin, axis, n });
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(sync());
      }
    });
  }

  dispose(): void {
    this.worker?.removeEventListener('message', this.onMessage);
    this.worker?.removeEventListener('error', this.onError);
    this.worker?.terminate();
    this.worker = null;
    this.resolvePendingWithFallback();
  }

  private onMessage = (event: MessageEvent<SliceResponse>): void => {
    const pending = this.pending.get(event.data.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(event.data.id);
    pending.resolve(event.data.result);
  };

  private onError = (): void => {
    this.worker?.terminate();
    this.worker = null;
    this.resolvePendingWithFallback();
  };

  private resolvePendingWithFallback(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(pending.fallback());
    }
    this.pending.clear();
  }
}
