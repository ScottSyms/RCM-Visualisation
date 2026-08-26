<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createViewer } from '../cesium/ViewerFactory.ts';
  import { loadMissionData, plannedWindow } from '../lib/data.ts';
  import { resolvePlaybackStart } from '../lib/playback-time.ts';
  import { MissionController } from '../mission/MissionController.ts';
  import Timeline from '../timeline/Timeline.svelte';
  import LayerDrawer from '../ui/LayerDrawer.svelte';
  import AcquisitionBrowser from '../ui/AcquisitionBrowser.svelte';
  import AcquisitionCard from '../ui/AcquisitionCard.svelte';
  import SatelliteCard from '../ui/SatelliteCard.svelte';
  import Diagnostics from '../ui/Diagnostics.svelte';

  type Phase = 'loading' | 'ready' | 'error' | 'nodata';
  type MobileDrawer = 'browse' | 'info' | null;
  let phase = $state<Phase>('loading');
  let err = $state<string | null>(null);
  let startMs = $state(0);
  let endMs = $state(0);
  let mobileDrawer = $state<MobileDrawer>(null);

  let viewerEl: HTMLDivElement;
  let viewer: import('cesium').Viewer | null = null;
  let ctrl: MissionController | null = null;
  let frameFn: () => void;
  let pickFn: (e: MouseEvent) => void;

  function seekFromTimestamp(ms: number): void {
    if (!ctrl) return;
    ctrl.seek(ms);
    const url = new URL(window.location.href);
    url.searchParams.set('start', new Date(ctrl.clock.nowMs).toISOString());
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function toggleMobileDrawer(drawer: Exclude<MobileDrawer, null>): void {
    mobileDrawer = mobileDrawer === drawer ? null : drawer;
  }

  function closeMobileDrawer(): void {
    mobileDrawer = null;
  }

  function handleWindowKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeMobileDrawer();
  }

  onMount(async () => {
    frameFn = () => ctrl?.update();
    pickFn = (e: MouseEvent) => {
      if (e.button !== 0 || e.defaultPrevented) return;
      if (!ctrl || !viewer) return;
      const id = ctrl.pickAt(e.clientX, e.clientY);
      if (id) ctrl.selectAcq(id);
    };

    try {
      viewer = createViewer(viewerEl);
    } catch (e) {
      phase = 'error';
      err = 'Could not create a WebGL context: ' + String(e);
      return;
    }
    ctrl = new MissionController(viewer);
    viewer.scene.postRender.addEventListener(frameFn);
    viewer.scene.canvas.addEventListener('click', pickFn);
    ctrl.log('info', 'Viewer created');

    try {
      const data = await loadMissionData();
      const win = plannedWindow(data.planned);
      if (!win) {
        phase = 'nodata';
        err = 'No planned acquisitions were found in the data set.';
        return;
      }
      const seed = resolvePlaybackStart(
        new URLSearchParams(window.location.search).get('start'),
        data.manifest.clockSeedMs ?? win.startMs,
        win.startMs,
        win.endMs,
      );
      const runtimeStart = Math.min(win.startMs, seed);
      await ctrl.build(
        { manifest: data.manifest, satellites: data.satellites, planned: data.planned, past: data.past },
        data.ephemeris,
        { startMs: runtimeStart, endMs: win.endMs, seedMs: seed },
      );
      startMs = runtimeStart;
      endMs = win.endMs;
      phase = 'ready';
    } catch (e) {
      const se = e as { name?: string; notFound?: boolean };
      if (se?.notFound || se?.name === 'DataMissingError') {
        phase = 'nodata';
        err = 'Mission data has not been generated yet.';
      } else {
        phase = 'error';
        err = String(e);
      }
    }
  });

  onDestroy(() => {
    if (viewer) {
      viewer.scene.postRender.removeEventListener(frameFn);
      viewer.scene.canvas.removeEventListener('click', pickFn);
      viewer?.destroy();
      viewer = null;
    }
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div bind:this={viewerEl} id="scene"></div>

{#if phase === 'ready' && ctrl}
  <div class="hdr">
    <div class="hdr-h"><span class="dot"></span>RCM · Mission Visualisation</div>
    <div class="hdr-sub">RADARSAT Constellation Mission — live orbital + acquisition</div>
  </div>

  {#if mobileDrawer}
    <button class="mobile-drawer-scrim" onclick={closeMobileDrawer} aria-label="Close information drawer"></button>
  {/if}

  <aside class="mobile-sidebar mobile-sidebar-left" class:open={mobileDrawer === 'browse'}>
    <button
      class="mobile-sidebar-tab"
      onclick={() => toggleMobileDrawer('browse')}
      aria-expanded={mobileDrawer === 'browse'}
      aria-controls="browse-drawer"
    >Browse</button>
    <div class="mobile-sidebar-shell panel" id="browse-drawer">
      <div class="mobile-sidebar-h">
        <span>Browse mission</span>
        <button onclick={closeMobileDrawer} aria-label="Close browse drawer">✕</button>
      </div>
      <AcquisitionBrowser controller={ctrl} />
      <Diagnostics diagnostics={ctrl.diagnostics} />
    </div>
  </aside>

  <aside class="mobile-sidebar mobile-sidebar-right" class:open={mobileDrawer === 'info'}>
    <button
      class="mobile-sidebar-tab"
      onclick={() => toggleMobileDrawer('info')}
      aria-expanded={mobileDrawer === 'info'}
      aria-controls="info-drawer"
    >Info</button>
    <div class="mobile-sidebar-shell panel" id="info-drawer">
      <div class="mobile-sidebar-h">
        <span>Layers and details</span>
        <button onclick={closeMobileDrawer} aria-label="Close information drawer">✕</button>
      </div>
      <LayerDrawer
        controller={ctrl}
        showPlanned={ctrl.showPlanned}
        showPast={ctrl.showPast}
        track={ctrl.track}
        satFilter={ctrl.satFilter}
      />
      <AcquisitionCard selectedAcq={ctrl.selectedAcq} mode={ctrl.mode} controller={ctrl} />
      <SatelliteCard selectedSat={ctrl.selectedSat} controller={ctrl} />
    </div>
  </aside>

  <Timeline
    nowMs={ctrl.nowMs}
    playing={ctrl.playing}
    speed={ctrl.speed}
    mode={ctrl.mode}
    satelliteViewHeightKm={ctrl.satelliteViewHeightKm}
    satelliteViewSat={ctrl.satelliteViewSat}
    satellites={ctrl.satviews()}
    {startMs}
    {endMs}
    onTogglePlay={() => ctrl?.togglePlay()}
    onSpeed={(m) => ctrl?.setSpeed(m)}
    onSeek={(ms) => ctrl?.seek(ms)}
    onTimestampSeek={seekFromTimestamp}
    onMode={(m) => ctrl?.setMode(m)}
    onSatelliteViewHeight={(deltaKm) => ctrl?.adjustSatelliteViewHeight(deltaKm)}
    onSatelliteViewSat={(norad) => ctrl?.selectSatelliteView(norad)}
  />
{:else if phase === 'loading'}
  <div class="status">
    <div class="status-card panel">
      <h2><span class="spin"></span>Preparing mission</h2>
      <p>Loading the constellation, building orbits, and rendering the acquisition plan.</p>
    </div>
  </div>
{:else if phase === 'nodata'}
  <div class="status">
    <div class="status-card panel">
      <h2>Mission data not found</h2>
      <p>{err ?? 'The generated data set could not be located.'}</p>
      <p>Generate it, then reload:</p>
      <pre class="cmd">npm run data
npm run dev</pre>
    </div>
  </div>
{:else}
  <div class="status">
    <div class="status-card panel">
      <h2>Something went wrong</h2>
      <p>{err ?? 'An unknown error occurred while starting the visualisation.'}</p>
    </div>
  </div>
{/if}
