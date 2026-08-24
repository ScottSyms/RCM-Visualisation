<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Writable } from 'svelte/store';
  import type { MissionController } from '../mission/MissionController.ts';
  import type { Acquisition } from '../../scripts/data/model.ts';
  import { fmtUtc } from '../lib/format.ts';

  let { controller }: { controller: MissionController } = $props();

  // --- $state variables ---
  let search = $state('');
  let searchL = $derived(search.toLowerCase().trim());

  let satFilterState = $state<Set<string>>(new Set());

  // raw filtered array kept in $state; derived below tracks $state deps.
  // controller.plannedCache is private; use the public plannedList() accessor.
  let filtered = $state(controller.plannedList());

  // --- expression-derived (single-line, no block) ---
  // Svelte 5 $derived with one expression works; block form {}
  // does not in this runtime. We re-assign filtered below when
  // search/satFilter change, and the derived below re-runs automatically.
  let filteredDerived = $derived(
    controller.plannedList().filter(
      (a) =>
        satFilterState.size === 0 ||
        satFilterState.has(a.satid) ||
        a.beam.toLowerCase().includes(searchL) ||
        a.id.toLowerCase().includes(searchL)
    )
  );

  // total pages from derived length
  let pageCount = $derived(Math.max(1, Math.ceil(filteredDerived.length / 50)));

  // current page
  let page = $state(1);

  // rows for current page — derived from filteredDerived
  let pageRows = $derived(filteredDerived.slice((page - 1) * 50, page * 50));

  let selectedId = $derived(controller.selectedAcq);

  // --- actions ---
  function goPage(n: number): void {
    const np = page + n;
    if (np >= 1 && np <= pageCount) page = np;
  }

  function onRowClick(id: string): void {
    controller.navigateToAcquisition(id);
    selectedId = controller.selectedAcq;
  }

  function sortHandler(key: string): void {
    if (sortState.key === key) {
      sortState.dir *= -1;
    } else {
      sortState.key = key;
      sortState.dir = 1;
    }
    // re-sort: re-assign filtered to trigger derived re-run
    const dir = sortState.dir;
    const rows = controller.plannedList().filter(
      (a) =>
        satFilterState.size === 0 ||
        satFilterState.has(a.satid) ||
        a.beam.toLowerCase().includes(searchL) ||
        a.id.toLowerCase().includes(searchL)
    );
    rows.sort((a, b) => {
      let ka = a.startMs,
        kb = b.startMs;
      if (ka !== kb) return ka - kb;
      return a.satid.localeCompare(b.satid) * dir;
    });
    filtered = rows; // direct assignment; $state dep tracking fires re-derive
    let _ = pageRows;
    page = 1;
  }

  let sortState = $state<{ key: string; dir: number }>({ key: 'startMs', dir: 1 });
</script>

<div class="browser panel" transition:fade>
  <div class="browser-h">
    <span class="browser-t">Acquisitions</span>
    <span class="browser-x" onclick={() => (selectedId = controller.selectedAcq ? controller.selectedAcq : null)} title="Close">✕</span>
  </div>

  <div class="browser-body">
    <!-- filters -->
    <div class="filter-row">
      <input
        class="filter-inp"
        type="text"
        placeholder="Search ID, satellite, beam…"
        bind:value={search}
      />
      <div class="sat-filter">
        <span class="lbl">Satellites</span>
        {#each [...new Set(controller.plannedList().map((a) => a.satid))] as sat}
          <label class="sat-row">
            <input
              type="checkbox"
              class="sat-chk"
              onclick={() => {
                const s = new Set(satFilterState);
                s.has(sat) ? s.delete(sat) : s.add(sat);
                satFilterState = s;
                controller.setSatFilter(s);
              }}
            />
            <span>{sat}</span>
          </label>
        {/each}}
      </div>
    </div>

    <!-- table -->
    {#if pageRows.length > 0}
      <table>
        <thead>
          <tr>
            <th class="sort-head" onclick={() => sortHandler('startMs')}>
              <span>Start</span>
              <span class="sort-arr">▲▼</span>
            </th>
            <th class="sort-head" onclick={() => sortHandler('satid')}>
              <span>Satellite</span>
              <span class="sort-arr">▲▼</span>
            </th>
            <th class="sort-head" onclick={() => sortHandler('centroid')}>
              <span>Centroid</span>
              <span class="sort-arr">▲▼</span>
            </th>
            <th class="sort-head" onclick={() => sortHandler('beam')}>
              <span>Beam</span>
              <span class="sort-arr">▲▼</span>
            </th>
            <th class="sort-head" onclick={() => sortHandler('radarMode')}>
              <span>Mode</span>
              <span class="sort-arr">▲▼</span>
            </th>
            <th class="sort-head" onclick={() => sortHandler('product')}>
              <span>Product</span>
              <span class="sort-arr">▲▼</span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each pageRows as acq}
            <tr class={acq.id === selectedId ? 'row-selected' : ''} onclick={() => onRowClick(acq.id)}>
              <td class="cell-start">{fmtUtc(acq.startMs)}</td>
              <td class="cell-sat">{acq.satid}</td>
              <td class="cell-centroid">
                {#if acq.centroid}
                  {acq.centroid[0].toFixed(2)}°, {acq.centroid[1].toFixed(2)}°
                {:else}
                  —
                {/if}
              </td>
              <td class="cell-beam">{acq.beam}</td>
              <td class="cell-mode">{acq.radarMode}</td>
              <td class="cell-product">{acq.product}</td>
              <td class="cell-action">Select</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if pageRows.length === 0}
      <div class="k-dim">No acquisitions match the current filters.</div>
    {/if}
  </div>

  <!-- pagination -->
  {#if pageCount > 1 && pageRows.length > 0}
  <div class="pager">
    <button class="pager-btn" onclick={() => goPage(-1)}>Prev</button>
    <span class="pager-info">Page {page} of {pageCount}</span>
    <button class="pager-btn" onclick={() => goPage(1)}>Next</button>
  </div>
  {/if}
</div>

<style>
  /* -- browser panel ---------------------------------------------------- */
  .browser {
    top: 18px;
    right: 20px;
    width: 340px;
    max-height: calc(100% - 130px);
    overflow: auto;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--stroke);
    border-radius: 10px;
    backdrop-filter: blur(14px) saturate(1.1);
    -webkit-backdrop-filter: blur(14px) saturate(1.1);
    box-shadow: 0 12px 40x rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 14px;
    pointer-events: auto;
  }
  .browser-h {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .browser-x {
    cursor: pointer;
    color: var(--ink-dim);
    font-size: 15px;
    line-height: 1;
  }
  .browser-x:hover {
    color: var(--ink-bright);
  }

  /* filters */
  .filter-row {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: center;
  }
  .filter-inp {
    flex: 1;
    min-width: 180px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--stroke);
    background: rgba(255, 255, 255, 0.03);
    color: var(--ink);
    font-size: 12px;
    outline: none;
  }
  .filter-inp::placeholder {
    color: var(--ink-dim);
  }
  .filter-inp:focus {
    border-color: var(--stroke-strong);
  }
  .sat-filter {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 120px;
  }
  .sat-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    cursor: pointer;
  }
  .sat-chk {
    width: 14px;
    height: 14px;
    border: 1px solid var(--stroke);
    border-radius: 4px;
    background: rgba(255, 180, 84, 0.03);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex: none;
  }
  .sat-chk.on {
    background: rgba(255, 180, 84, 0.25);
    border-color: rgba(255, 180, 84, 0.6);
  }
  .sat-chk.on::after {
    content: '✓';
    font-size: 10px;
    color: var(--ink-bright);
  }

  /* table */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--stroke);
    vertical-align: top;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--panel);
    z-index: 10;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  tr {
    cursor: pointer;
    transition: background 0.15s;
  }
  tr:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .row-selected {
    background: rgba(255, 180, 84, 0.18);
    border-top: 2px solid var(--accent);
    border-radius: 0 0 6px 6px;
  }
  .cell-start {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-bright);
    text-align: right;
  }
  .cell-sat {
    color: var(--ink-bright);
  }
  .cell-centroid {
    color: var(--ink);
    font-size: 11px;
  }
  .cell-beam,
  .cell-mode,
  .cell-product {
    color: var(--ink);
    font-size: 11px;
  }
  .cell-action {
    color: var(--accent);
    font-size: 10px;
    font-weight: 600;
    text-align: right;
  }

  /* pagination */
  .pager {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--ink-dim);
  }
  .pager-btn {
    pointer-events: auto;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--stroke);
    background: rgba(255, 255, 255, 0.03);
    color: var(--ink);
    font-size: 11px;
    transition: 0.15s border-color, 0.15s color, 0.15s background;
  }
  .pager-btn:hover {
    border-color: var(--stroke-strong);
    color: var(--ink-bright);
  }
  .pager-btn:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
</style>