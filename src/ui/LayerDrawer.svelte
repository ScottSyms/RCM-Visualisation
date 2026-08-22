<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { MissionController } from '../mission/MissionController.ts';
  import type { SatelliteView } from '../mission/types.ts';

  let {
    controller,
    showPlanned,
    showPast,
    track,
    satFilter,
  }: {
    controller: MissionController;
    showPlanned: Writable<boolean>;
    showPast: Writable<boolean>;
    track: Writable<boolean>;
    satFilter: Writable<Set<string>>;
  } = $props();

  let sats = controller.satviews() as SatelliteView[];

  let q = $state('');
  let ql = $derived(q.toLowerCase().trim());
  let matches = $derived(
    ql
      ? controller
          .plannedList()
          .filter(
            (a) =>
              a.id.toLowerCase().includes(ql) ||
              a.satid.toLowerCase().includes(ql) ||
              a.beam.toLowerCase().includes(ql),
          )
          .slice(0, 8)
      : [],
  );

  function toggleSat(satId: string): void {
    const s = new Set($satFilter);
    if (s.has(satId)) s.delete(satId);
    else s.add(satId);
    controller.setSatFilter(s);
  }
</script>

<div class="drawer panel">
  <div class="sec">
    <div class="sec-h">Satellites</div>
    {#each sats as s (s.norad)}
      <label class="sec-row">
        <span
          class="chk"
          class:on={$satFilter.has(s.name)}
          role="checkbox"
          tabindex="0"
          onclick={() => toggleSat(s.name)}
        ></span>
        <span class="swatch" style="background: {s.color}"></span>
        <span>{s.name}</span>
        <span class="mono k-dim" style="margin-left:auto">{s.intl}</span>
      </label>
    {/each}
  </div>

  <div class="sec">
    <div class="sec-h">Layers</div>
    <label class="sec-row"><span class="chk" class:on={$showPlanned} onclick={() => controller.setPlannedVisible(!$showPlanned)}></span> Planned footprints</label>
    <label class="sec-row"><span class="chk" class:on={$showPast} onclick={() => controller.setPastVisible(!$showPast)}></span> Past coverage</label>
    <label class="sec-row"><span class="chk" class:on={$track} onclick={() => controller.setTrackVisible(!$track)}></span> Ground tracks</label>
  </div>

  <div class="sec">
    <div class="sec-h">Search</div>
    <input
      class="search"
      type="text"
      placeholder="Sat, beam or id…"
      bind:value={q}
    />
    {#if matches.length}
      <div class="results">
        {#each matches as a (a.id)}
          <button class="result" onclick={() => controller.selectAcq(a.id)}>
            <span class="mono">{a.id}</span>
            <span class="k-dim">{a.satid} · {a.beam}</span>
          </button>
        {/each}
      </div>
    {:else if ql}
      <div class="k-dim" style="font-size:11px">No matches.</div>
    {/if}
  </div>
</div>
