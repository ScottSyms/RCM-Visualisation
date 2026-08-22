<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { DiagnosticLine } from '../mission/types.ts';
  import { fmtLog } from '../lib/format.ts';

  let { diagnostics }: { diagnostics: Writable<DiagnosticLine[]> } = $props();
  let lines = $derived($diagnostics.slice(-48).reverse());
</script>

<div class="diag panel">
  <div class="diag-h">
    <span class="sec-h">Diagnostics</span>
  </div>
  {#each lines as l (l.at + l.text)}
    <div class="log-{l.level}"><span class="mono">{fmtLog(l.at)}</span> {l.text}</div>
  {:else}
    <div class="log-info">No diagnostics yet.</div>
  {/each}
</div>
