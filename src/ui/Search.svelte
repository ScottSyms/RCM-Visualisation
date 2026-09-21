<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { MissionController } from '../mission/MissionController.ts';
  import { applyCommandIntent } from '../mission/CommandExecutor.ts';
  import { requestCommand } from '../lib/command.ts';

  let { controller }: { controller: MissionController } = $props();

  let open = $state(false);
  let query = $state('');
  let status = $state<'idle' | 'thinking' | 'done' | 'error'>('idle');
  let message = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function show(): void {
    if (closeTimer) clearTimeout(closeTimer);
    open = true;
    status = 'idle';
    message = '';
    query = '';
    queueMicrotask(() => inputEl?.focus());
  }

  function close(): void {
    if (closeTimer) clearTimeout(closeTimer);
    open = false;
  }

  function isTypingTarget(el: EventTarget | null): boolean {
    const t = el as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onWindowKeydown(e: KeyboardEvent): void {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (open) close();
      else show();
      return;
    }
    if (e.key === '/' && !open && !isTypingTarget(e.target)) {
      e.preventDefault();
      show();
    }
  }

  async function submit(): Promise<void> {
    const q = query.trim();
    if (!q || status === 'thinking') return;
    status = 'thinking';
    message = '';
    try {
      const intent = await requestCommand(q, controller.clock.nowMs);
      message = applyCommandIntent(controller, intent);
      status = intent.type === 'unrecognized' ? 'error' : 'done';
      if (status === 'done') closeTimer = setTimeout(close, 900);
    } catch (e) {
      status = 'error';
      message = 'Command service unavailable — try the Browse or layer panels instead.';
      controller.log('warn', `command bar: ${String(e)}`);
    }
  }

  function onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter') {
      void submit();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <button class="cmd-scrim" onclick={close} aria-label="Close command bar" transition:fade={{ duration: 120 }}></button>
  <div class="cmd panel" role="dialog" aria-label="Command bar" transition:fade={{ duration: 120 }}>
    <div class="cmd-row">
      <span class="cmd-icon" aria-hidden="true">⌘K</span>
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={onInputKeydown}
        placeholder="Follow RCM-2 · hide historical coverage · jump forward 6 hours"
        autocomplete="off"
        spellcheck="false"
      />
      {#if status === 'thinking'}<span class="cmd-spin" aria-hidden="true"></span>{/if}
    </div>
    {#if message}
      <div class="cmd-msg" class:err={status === 'error'}>{message}</div>
    {/if}
  </div>
{/if}

<style>
  .cmd-scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    padding: 0;
    border: 0;
    background: rgba(1, 3, 7, 0.5);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    pointer-events: auto;
  }
  .cmd {
    position: fixed;
    z-index: 61;
    top: 18vh;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    max-width: calc(100vw - 32px);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: auto;
  }
  .cmd-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cmd-icon {
    flex: none;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.06em;
    color: var(--ink-dim);
    padding: 3px 6px;
    border: 1px solid var(--stroke);
    border-radius: 5px;
  }
  .cmd-row input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--ink-bright);
    font-size: 14px;
    outline: none;
  }
  .cmd-row input::placeholder {
    color: var(--ink-dim);
  }
  .cmd-spin {
    flex: none;
    width: 13px;
    height: 13px;
    border: 2px solid rgba(255, 180, 84, 0.25);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: cmd-spin 0.8s linear infinite;
  }
  @keyframes cmd-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .cmd-msg {
    font-size: 12px;
    color: var(--complete-2);
    border-top: 1px solid var(--stroke);
    padding-top: 8px;
  }
  .cmd-msg.err {
    color: var(--warn);
  }
</style>
