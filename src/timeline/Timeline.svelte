<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Writable } from 'svelte/store';
  import type { CameraMode, SatelliteView } from '../mission/types.ts';
  import { fmtUtc, fmtSpeed } from '../lib/format.ts';
  import { clampTimestamp, formatUtcInput, parseUtcTimestamp } from '../lib/playback-time.ts';

  let {
    nowMs,
    playing,
    speed,
    mode,
    satelliteViewHeightKm,
    satelliteViewSat,
    satellites,
    startMs,
    endMs,
    onTogglePlay,
    onSpeed,
    onSeek,
    onTimestampSeek,
    onEndSeek,
    onCopyLink,
    onMode,
    onSatelliteViewHeight,
    onSatelliteViewSat,
  }: {
    nowMs: Writable<number>;
    playing: Writable<boolean>;
    speed: Writable<number>;
    mode: Writable<CameraMode>;
    satelliteViewHeightKm: Writable<number>;
    satelliteViewSat: Writable<number | null>;
    satellites: SatelliteView[];
    startMs: number;
    endMs: number;
    onTogglePlay: () => void;
    onSpeed: (m: number) => void;
    onSeek: (ms: number) => void;
    onTimestampSeek: (ms: number) => void;
    onEndSeek: (ms: number) => void;
    onCopyLink: (ms: number) => Promise<void>;
    onMode: (m: CameraMode) => void;
    onSatelliteViewHeight: (deltaKm: number) => void;
    onSatelliteViewSat: (norad: number) => void;
  } = $props();

  let start = $derived(new Date(startMs).toISOString().slice(0, 16).replace('T', ' '));
  let end = $derived(new Date(endMs).toISOString().slice(0, 16).replace('T', ' '));
  let pct = $derived(endMs > startMs ? (($nowMs - startMs) / (endMs - startMs)) * 100 : 0);
  let time = $derived(fmtUtc($nowMs));
  let editingTimestamp = $state(false);
  let dateInput = $state('');
  let timeInput = $state('');
  let editingEnd = $state(false);
  let endDateInput = $state('');
  let endTimeInput = $state('');
  let mobileCollapsed = $state(true);
  let copyStatus = $state<'idle' | 'copied' | 'error'>('idle');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => clearTimeout(copyTimer));

  $effect(() => {
    if (!editingTimestamp && Number.isFinite($nowMs)) setTimestampInputs($nowMs);
  });
  $effect(() => {
    if (!editingEnd && Number.isFinite(endMs)) setEndInputs(endMs);
  });

  function setTimestampInputs(timestampMs: number): void {
    [dateInput, timeInput] = formatUtcInput(timestampMs).split('T');
  }
  function setEndInputs(timestampMs: number): void {
    [endDateInput, endTimeInput] = formatUtcInput(timestampMs).split('T');
  }

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
  function selectSatellite(e: Event): void {
    onSatelliteViewSat(Number((e.currentTarget as HTMLSelectElement).value));
  }
  function submitTimestamp(e: SubmitEvent): void {
    e.preventDefault();
    const parsed = parseUtcTimestamp(`${dateInput}T${timeInput}`);
    if (parsed == null) {
      setTimestampInputs($nowMs);
      editingTimestamp = false;
      return;
    }
    const clamped = clampTimestamp(parsed, startMs, endMs);
    setTimestampInputs(clamped);
    editingTimestamp = false;
    onTimestampSeek(clamped);
  }
  function timestampKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    setTimestampInputs($nowMs);
    editingTimestamp = false;
    (e.currentTarget as HTMLInputElement).blur();
  }
  function submitEnd(e: SubmitEvent): void {
    e.preventDefault();
    const parsed = parseUtcTimestamp(`${endDateInput}T${endTimeInput}`);
    if (parsed == null) {
      setEndInputs(endMs);
      editingEnd = false;
      return;
    }
    let clamped = clampTimestamp(parsed, startMs, endMs > startMs ? 2147483647000 : endMs);
    // clamp to mission window via startMs..far future then enforce order
    // Use current startMs as lower bound, allow any future up to large limit, then App will clamp to true win
    if (clamped < startMs) clamped = startMs;
    setEndInputs(clamped);
    editingEnd = false;
    onEndSeek(clamped);
  }
  function endKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    setEndInputs(endMs);
    editingEnd = false;
    (e.currentTarget as HTMLInputElement).blur();
  }
  async function copyLink(): Promise<void> {
    clearTimeout(copyTimer);
    try {
      await onCopyLink($nowMs);
      copyStatus = 'copied';
    } catch {
      copyStatus = 'error';
    }
    copyTimer = setTimeout(() => (copyStatus = 'idle'), 1800);
  }
</script>

<div class="tl panel" class:mobile-collapsed={mobileCollapsed} id="mission-timeline">
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
    <form class="tl-time" onsubmit={submitTimestamp} title="Seek to UTC timestamp">
      <input
        class="tl-date"
        type="date"
        bind:value={dateInput}
        onfocus={() => (editingTimestamp = true)}
        onkeydown={timestampKeydown}
        aria-label="Playback date in UTC"
        required
      />
      <input
        class="tl-clock"
        type="text"
        inputmode="numeric"
        placeholder="HH:mm:ss"
        pattern="(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d"
        maxlength="8"
        bind:value={timeInput}
        onfocus={() => (editingTimestamp = true)}
        onkeydown={timestampKeydown}
        aria-label="Playback time in UTC, 24-hour format"
        required
      />
      <span>UTC</span>
      <button type="submit">Go</button>
      <button class="tl-copy" type="button" onclick={() => void copyLink()}>
        {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Retry' : 'Copy'}
      </button>
    </form>
    <form class="tl-time" onsubmit={submitEnd} title="Set window end (UTC)">
      <input
        class="tl-date"
        type="date"
        bind:value={endDateInput}
        onfocus={() => (editingEnd = true)}
        onkeydown={endKeydown}
        aria-label="Playback end date in UTC"
        required
      />
      <input
        class="tl-clock"
        type="text"
        inputmode="numeric"
        placeholder="HH:mm:ss"
        pattern="(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d"
        maxlength="8"
        bind:value={endTimeInput}
        onfocus={() => (editingEnd = true)}
        onkeydown={endKeydown}
        aria-label="Playback end time in UTC, 24-hour format"
        required
      />
      <span>UTC</span>
      <button type="submit">Set end</button>
    </form>
    <button class="tl-btn play" onclick={onTogglePlay} title="Play / pause">
      {$playing ? '⏸' : '▶'}
    </button>
    <button class="tl-speed" onclick={() => cycleSpeed()} title="Playback speed">
      {fmtSpeed($speed)}×
    </button>
    <div class="tl-cam">
      <button class:on={$mode === 'overview'} onclick={() => onMode('overview')}>Globe</button>
      <button class:on={$mode === 'follow'} onclick={() => onMode('follow')}>Follow</button>
      {#if $mode === 'acquisition'}
        <select
          class="tl-satellite"
          aria-label="Satellite view satellite"
          value={$satelliteViewSat ?? ''}
          onchange={selectSatellite}
        >
          {#each satellites as sat (sat.norad)}
            <option value={sat.norad}>{sat.name}</option>
          {/each}
        </select>
        <button
          onclick={() => onSatelliteViewHeight(-500)}
          disabled={$satelliteViewHeightKm <= 500}
          title="Lower view by 500 km"
        >−</button>
        <span class="tl-altitude mono">{$satelliteViewHeightKm} km</span>
        <button
          onclick={() => onSatelliteViewHeight(500)}
          disabled={$satelliteViewHeightKm >= 3000}
          title="Raise view by 500 km"
        >+</button>
        <button class:on={true} onclick={() => onMode('overview')} title="Exit satellite view">Satellite</button>
      {/if}
    </div>
    <button
      class="tl-mobile-collapse"
      onclick={() => (mobileCollapsed = true)}
      aria-expanded={!mobileCollapsed}
      aria-controls="mission-timeline"
      title="Hide playback controls"
    >▼</button>
  </div>
</div>

<div class="tl-mobile-dock panel" class:visible={mobileCollapsed}>
  <button class="tl-btn play" onclick={onTogglePlay} title="Play / pause">
    {$playing ? '⏸' : '▶'}
  </button>
  <button
    class="tl-mobile-expand"
    onclick={() => (mobileCollapsed = false)}
    aria-expanded={!mobileCollapsed}
    aria-controls="mission-timeline"
    title="Show playback controls"
  >▲</button>
</div>
