import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SliceResult } from '../src/lib/slicer.ts';
import { Slicer } from '../src/lib/slicer.ts';

type WorkerListener = (event: MessageEvent) => void;

class FakeWorker {
  static instance: FakeWorker;
  messages: Array<{ id: number }> = [];
  private listeners = new Map<string, Set<WorkerListener>>();

  constructor() {
    FakeWorker.instance = this;
  }

  addEventListener(type: string, listener: WorkerListener): void {
    const listeners = this.listeners.get(type) ?? new Set<WorkerListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: WorkerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: { id: number }): void {
    this.messages.push(message);
  }

  respond(id: number, result: SliceResult): void {
    const event = { data: { id, result } } as MessageEvent;
    for (const listener of this.listeners.get('message') ?? []) listener(event);
  }

  terminate(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Slicer worker requests', () => {
  it('correlates concurrent responses even when they return out of order', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const slicer = new Slicer();
    const first = slicer.slice([], [0, 0], [1, 0], 1);
    const second = slicer.slice([], [1, 1], [0, 1], 2);
    const worker = FakeWorker.instance;
    const firstResult: SliceResult = { slices: [[[1, 1]]], params: null };
    const secondResult: SliceResult = { slices: [[[2, 2]]], params: null };

    worker.respond(worker.messages[1].id, secondResult);
    worker.respond(worker.messages[0].id, firstResult);

    await expect(first).resolves.toEqual(firstResult);
    await expect(second).resolves.toEqual(secondResult);
    slicer.dispose();
  });
});
