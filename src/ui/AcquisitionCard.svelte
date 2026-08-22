<script lang="ts">
  import type { Writable } from 'svelte/store';
  import { fmtUtc } from '../lib/format.ts';
  import type { MissionController } from '../mission/MissionController.ts';

  let { selectedAcq, controller }: {
    selectedAcq: Writable<string | null>;
    controller: MissionController;
  } = $props();

  let acq = $derived($selectedAcq ? controller.acquisition($selectedAcq) : null);
  let dur = $derived(acq ? Math.round((acq.endMs - acq.startMs) / 1000) : 0);
</script>

{#if acq}
  <div class="card panel">
    <div class="card-h">
      <span class="t">{acq.kind === 'planned' ? 'Planned' : 'Acquired'}</span>
      <span class="x" onclick={() => controller.selectAcq(null)} title="Close">✕</span>
    </div>
    <div class="pill {acq.kind}">{acq.kind}</div>
    <div class="kv">
      <span class="k">Satellite</span><span class="v">{acq.satid}</span>
      <span class="k">Beam</span><span class="v">{acq.beam} · {acq.beamId}</span>
      <span class="k">Polarization</span><span class="v">{acq.polType} · {acq.pol}</span>
      <span class="k">Mode · CCD</span><span class="v">{acq.radarMode} · {acq.ccd}</span>
      <span class="k">Product</span><span class="v">{acq.product}</span>
      <span class="k">Start (UTC)</span><span class="v">{fmtUtc(acq.startMs)}</span>
      <span class="k">End (UTC)</span><span class="v">{fmtUtc(acq.endMs)}</span>
      <span class="k">Duration</span><span class="v">{dur}s</span>
      {#if acq.centroid}
        <span class="k">Footprint</span>
        <span class="v">{acq.centroid[0].toFixed(1)}°, {acq.centroid[1].toFixed(1)}°</span>
      {/if}
    </div>
    <div class="card-actions">
      <button class="btn" onclick={() => controller.flyToAcq(acq.id)}>Fly to</button>
    </div>
  </div>
{/if}
