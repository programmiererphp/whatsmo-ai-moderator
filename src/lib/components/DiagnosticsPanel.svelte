<script lang="ts">
  import { onMount } from 'svelte';
  import {
    diagnosticEntries, diagnosticVerbose, clearDiagnosticEntries,
    formatDiagnosticReport, recordDiagnostic, recordDiagnosticError,
    setDiagnosticVerbose
  } from '$lib/diagnostics/logger';
  import { readNativeDiagnostics } from '$lib/api/whatsmo';
  import Icon from './Icon.svelte';

  export let onClose: () => void = () => undefined;

  let nativeLogs = '';
  let nativeLoading = false;
  let notice = '';
  let filter: 'all' | 'warn' | 'error' = 'all';
  $: visibleEntries = $diagnosticEntries
    .filter(entry => filter === 'all' || entry.level === filter)
    .slice(-100).reverse();

  onMount(() => {
    recordDiagnostic('info', 'diagnostics', 'viewer_opened');
    void refreshNative();
  });

  async function refreshNative(): Promise<void> {
    nativeLoading = true;
    try {
      nativeLogs = await readNativeDiagnostics();
      notice = 'Native logs loaded';
    } catch (error) {
      nativeLogs = '';
      recordDiagnosticError('diagnostics', 'native_read_failed', error);
      notice = 'Native logs unavailable; JavaScript logs are still accessible.';
    } finally {
      nativeLoading = false;
    }
  }

  function report(): string {
    return formatDiagnosticReport(nativeLogs);
  }

  async function copyReport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(report());
      notice = 'Diagnostic report copied';
      recordDiagnostic('info', 'diagnostics', 'report_copied');
    } catch (error) {
      recordDiagnosticError('diagnostics', 'copy_failed', error);
      notice = 'Copy failed. Try Export report.';
    }
  }

  function exportReport(): void {
    try {
      const blob = new Blob([report()], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whatsmo-diagnostics-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      notice = 'Export requested; use Copy if Android blocks downloads.';
      recordDiagnostic('info', 'diagnostics', 'report_exported');
    } catch (error) {
      recordDiagnosticError('diagnostics', 'export_failed', error);
      notice = 'Export failed; use Copy report.';
    }
  }

  function clearEntries(): void {
    if (!window.confirm('Clear stored JavaScript diagnostic entries on this device? Native logs are retained.')) return;
    clearDiagnosticEntries();
    notice = 'JavaScript history cleared';
  }
</script>

<div class="diagnostic-panel">
  <header>
    <button type="button" class="back" aria-label="Back to settings" on:click={onClose}>
      <Icon name="arrow_back" size="22px" />
    </button>
    <h2>Diagnostics</h2>
  </header>
  <div class="content">
    <p class="hint">Local diagnostic history survives app restarts. Report errors or sudden shutdowns using Copy report after reopening Whatsmo. No chat text or API keys are intentionally recorded.</p>

    <div class="summary">
      <span>Stored events: <strong>{$diagnosticEntries.length}</strong></span>
      <span>Errors: <strong>{$diagnosticEntries.filter(x => x.level === 'error').length}</strong></span>
      <span>Warnings: <strong>{$diagnosticEntries.filter(x => x.level === 'warn').length}</strong></span>
    </div>

    <div class="toggle-row">
      <div>
        <strong>Detailed event tracing</strong>
        <small>Record button presses and routine events (limited to last 500 entries)</small>
      </div>
      <input type="checkbox" checked={$diagnosticVerbose}
        on:change={(e) => setDiagnosticVerbose((e.currentTarget as HTMLInputElement).checked)}
        aria-label="Detailed event tracing" />
    </div>

    <div class="actions">
      <button type="button" class="primary" on:click={copyReport}>
        <Icon name="content_copy" size="18px" /> Copy report
      </button>
      <button type="button" on:click={exportReport}>
        <Icon name="download" size="18px" /> Export .txt
      </button>
    </div>
    <div class="actions">
      <button type="button" disabled={nativeLoading} on:click={refreshNative}>
        <Icon name="refresh" size="18px" /> {nativeLoading ? 'Loading...' : 'Refresh native logs'}
      </button>
      <button type="button" on:click={clearEntries}>
        <Icon name="delete_outline" size="18px" /> Clear events
      </button>
    </div>

    {#if notice}
      <p class="notice" role="status">{notice}</p>
    {/if}

    <div class="heading">
      <h3>Recent events</h3>
      <select bind:value={filter} aria-label="Filter diagnostic level">
        <option value="all">All</option>
        <option value="warn">Warnings</option>
        <option value="error">Errors</option>
      </select>
    </div>

    <div class="events">
      {#if visibleEntries.length === 0}
        <p class="empty">No entries match the filter.</p>
      {:else}
        {#each visibleEntries as entry, index (entry.timestamp + entry.event + index)}
          <div class="entry" class:failure={entry.level === 'error'} class:warning={entry.level === 'warn'}>
            <span class="timestamp">{new Date(entry.timestamp).toLocaleTimeString()} · {entry.level}</span>
            <strong>{entry.area}.{entry.event}</strong>
            {#if entry.details}
              <small>{JSON.stringify(entry.details)}</small>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <p class="hint">Native Rust and Android fatal-exception logs are included in Copy/Export when available. Check exported reports before sharing: automatic redaction cannot guarantee removal of every sensitive value. Android system kills, native signals and ANRs may require external Android logcat.</p>
  </div>
</div>

<style>
  .diagnostic-panel { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; background:var(--paper); color:var(--ink); }
  header { display:flex; align-items:center; padding:calc(8px + var(--safe-top, 0px)) 12px 10px; gap:12px; flex:0 0 auto; }
  h2 { font-size:1.2rem; font-weight:600; margin:0; }
  .back { border:0; background:transparent; color:var(--ink); width:40px; height:40px; display:grid; place-items:center; }
  .content { overflow-y:auto; padding:8px 16px max(16px, var(--safe-bottom, 0px)); min-height:0; }
  .hint { font-size:0.78rem; line-height:1.45; color:var(--muted); }
  .summary { display:flex; justify-content:space-between; gap:6px; margin:12px 0; font-size:0.78rem; }
  .summary span { border-radius:10px; background:var(--border-color); padding:8px; }
  .toggle-row { display:flex; gap:12px; align-items:center; justify-content:space-between; padding:10px 0; }
  .toggle-row strong { display:block; font-size:0.87rem; }
  .toggle-row small { display:block; font-size:0.75rem; color:var(--muted); }
  .toggle-row input { flex-shrink:0; }
  .actions { display:flex; gap:8px; margin:8px 0; }
  .actions button { min-width:0; flex:1; min-height:42px; border-radius:12px; background:var(--border-color); color:var(--ink); border:0; font-size:0.78rem; display:flex; align-items:center; justify-content:center; gap:4px; }
  .actions button.primary { background:var(--wa-green-dark); color:white; font-weight:600; }
  .actions button:disabled { opacity:0.45; }
  .notice { margin:6px 0; font-size:0.8rem; color:var(--wa-green-dark); }
  .heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:14px; }
  .heading h3 { margin:0; font-size:0.95rem; }
  .heading select { max-width:140px; min-height:36px; }
  .events { display:grid; gap:5px; margin:10px 0 22px; }
  .entry { background:var(--border-color); padding:9px; border-radius:9px; display:grid; gap:3px; overflow-wrap:anywhere; border-left:3px solid transparent; }
  .entry.failure { border-left-color:#d32f2f; }
  .entry.warning { border-left-color:#d98511; }
  .entry strong { font-size:0.78rem; font-weight:600; }
  .entry small { font-family:monospace; font-size:0.7rem; color:var(--muted); }
  .timestamp { font-size:0.69rem; color:var(--muted); }
  .empty { font-size:0.8rem; color:var(--muted); }
</style>
