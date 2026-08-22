<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { MissionController } from '../mission/MissionController.ts';
  import type { SatelliteView } from '../mission/types.ts';
  import { fmtUtc } from '../lib/format.ts';

  let { selectedSat, controller }: {
    selectedSat: Writable<number | null>;
    controller: MissionController;
  } = $props();

  let sat = $derived(
    $selectedSat
      ? (controller.satviews() as SatelliteView[]).find((s) => s.norad === $selectedSat)
      : null,
  );
</script>

{#if sat}
  <div class="card panel">
    <div class="card-h">
      <span class="t" style="color:{sat.color}">{sat.name}</span>
      <span class="x" onclick={() => controller.selectSat(null)} title="Close">✕</span>
    </div>
    <div class="kv">
      <span class="k">NORAD</span><span class="v">{sat.norad}</span>
      <span class="k">Int'l desig</span><span class="v">{sat.intl}</span>
      <span class="k">Inclination</span><span class="v">{sat.inclination.toFixed(2)}°</span>
      <span class="k">TLE epoch</span><span class="v">{fmtUtc(sat.epochMs)}</span>
    </div>
    <div class="card-actions">
      <button class="btn" onclick={() => { controller.selectSat(sat.norad); controller.setMode('follow'); }}>
        Follow
      </button>
      <button class="btn" onclick={() => controller.flyToSat(sat.norad)}>Fly to</button>
    </div>
  </div>
{/if}
