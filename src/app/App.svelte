<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createViewer } from '../cesium/ViewerFactory.ts';
  import { loadMissionData, plannedWindow } from '../lib/data.ts';
  import { MissionController } from '../mission/MissionController.ts';
  import Timeline from '../timeline/Timeline.svelte';
  import LayerDrawer from '../ui/LayerDrawer.svelte';
  import AcquisitionCard from '../ui/AcquisitionCard.svelte';
  import SatelliteCard from '../ui/SatelliteCard.svelte';
  import Diagnostics from '../ui/Diagnostics.svelte';

  type Phase = 'loading' | 'ready' | 'error' | 'nodata';
  let phase = $state<Phase>('loading');
  let err = $state<string | null>(null);
  let startMs = $state(0);
  let endMs = $state(0);

  let viewerEl: HTMLDivElement;
  let viewer: import('cesium').Viewer | null = null;
  let ctrl: MissionController | null = null;
  let frameFn: () => void;
  let pickFn: (e: MouseEvent) => void;

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
      const seed = data.manifest.clockSeedMs ?? win.startMs;
      await ctrl.build(
        { manifest: data.manifest, satellites: data.satellites, planned: data.planned, past: data.past },
        data.ephemeris,
        { startMs: win.startMs, endMs: win.endMs, seedMs: seed },
      );
      startMs = win.startMs;
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

<div bind:this={viewerEl} id="scene"></div>

{#if phase === 'ready' && ctrl}
  <div class="hdr">
    <div class="hdr-h"><span class="dot"></span>RCM · Mission Visualisation</div>
    <div class="hdr-sub">RADARSAT Constellation Mission — live orbital + acquisition</div>
  </div>

  <LayerDrawer
    controller={ctrl}
    showPlanned={ctrl.showPlanned}
    showPast={ctrl.showPast}
    track={ctrl.track}
    satFilter={ctrl.satFilter}
  />

  <AcquisitionCard selectedAcq={ctrl.selectedAcq} controller={ctrl} />
  <SatelliteCard selectedSat={ctrl.selectedSat} controller={ctrl} />

  <Timeline
    nowMs={ctrl.nowMs}
    playing={ctrl.playing}
    speed={ctrl.speed}
    mode={ctrl.mode}
    {startMs}
    {endMs}
    onTogglePlay={() => ctrl?.togglePlay()}
    onSpeed={(m) => ctrl?.setSpeed(m)}
    onSeek={(ms) => ctrl?.seek(ms)}
    onMode={(m) => ctrl?.setMode(m)}
  />

  <Diagnostics diagnostics={ctrl.diagnostics} />
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
