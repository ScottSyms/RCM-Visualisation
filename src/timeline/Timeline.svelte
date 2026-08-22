<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { CameraMode } from '../mission/types.ts';
  import { fmtUtc, fmtSpeed } from '../lib/format.ts';

  let {
    nowMs,
    playing,
    speed,
    mode,
    startMs,
    endMs,
    onTogglePlay,
    onSpeed,
    onSeek,
    onMode,
  }: {
    nowMs: Writable<number>;
    playing: Writable<boolean>;
    speed: Writable<number>;
    mode: Writable<CameraMode>;
    startMs: number;
    endMs: number;
    onTogglePlay: () => void;
    onSpeed: (m: number) => void;
    onSeek: (ms: number) => void;
    onMode: (m: CameraMode) => void;
  } = $props();

  let start = new Date(startMs).toISOString().slice(0, 16).replace('T', ' ');
  let end = new Date(endMs).toISOString().slice(0, 16).replace('T', ' ');
  let pct = $derived(endMs > startMs ? (($nowMs - startMs) / (endMs - startMs)) * 100 : 0);
  let time = $derived(fmtUtc($nowMs));

  const speeds = [1, 10, 60, 300, 1200];
  function cycleSpeed(): void {
    const i = speeds.indexOf($speed);
    onSpeed(speeds[(i + 1) % speeds.length]);
  }
  function seek(e: MouseEvent): void {
    const el = e.currentTarget as HTMLDivElement;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(startMs + f * (endMs - startMs));
  }
</script>

<div class="tl panel">
  <div class="tl-body">
    <div class="tl-range">
      <span class="mono">{start}</span>
      <span class="mono">{time}</span>
      <span class="mono">{end}</span>
    </div>
    <div class="tl-track" onclick={seek} title="Seek">
      <div class="tl-playhead" style="left: {pct}%"></div>
    </div>
  </div>

  <div class="tl-btns">
    <button class="tl-btn play" onclick={onTogglePlay} title="Play / pause">
      {$playing ? '⏸' : '▶'}
    </button>
    <button class="tl-speed" onclick={() => cycleSpeed()} title="Playback speed">
      {fmtSpeed($speed)}×
    </button>
    <div class="tl-cam">
      <button class:on={$mode === 'overview'} onclick={() => onMode('overview')}>Globe</button>
      <button class:on={$mode === 'follow'} onclick={() => onMode('follow')}>Follow</button>
    </div>
  </div>
</div>
