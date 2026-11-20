<script lang="ts">
  import { outbox, cancelDraft, scheduleDraft, updateDraft, dispatchDraft, type OutboxDraft } from './outbox';
  import { recordDiagnosticError } from '$lib/diagnostics/logger';
  export let chatId: string;
  export let onDispatch: (draft: OutboxDraft) => Promise<boolean>;
  let delayMinutes = 10;
  let editing: Record<string,string> = {};
  $: items = $outbox.filter(d => d.chatId === chatId);
  function acceptSuggestion(item: OutboxDraft): void {
    updateDraft(item.id, { text: item.suggestion });
    editing[item.id] = item.suggestion;
    editing = editing;
  }
  function saveText(item: OutboxDraft): void {
    updateDraft(item.id, { text: editing[item.id] ?? item.text });
  }
  function delayed(item: OutboxDraft): void {
    saveText(item);
    try { scheduleDraft(item.id, Number(delayMinutes)); }
    catch(e) { recordDiagnosticError('moderator','schedule_failed',e); }
  }
  async function sendNow(item:OutboxDraft):Promise<void> {
    saveText(item);
    await dispatchDraft(item.id,onDispatch);
  }
</script>
{#if items.length}
  <div class="outbox" aria-label="AI message review">
    <p class="warn">Native sending is protected while investigating an Android crash. Arm one test send in Whatsmo Recovery. Automatic delayed sending is paused.</p>
    {#each items as item (item.id)}
      <div class="draft">
        <div class="heading">
          <strong>AI Coach · {item.status === 'analyzing' ? 'Analyzing…' : item.status === 'scheduled' ? 'Scheduled' : item.status === 'sending' ? 'Sending…' : 'Review before sending'}</strong>
          <button class="cancel" type="button" on:click={() => cancelDraft(item.id)}>Cancel</button>
        </div>
        {#if item.status === 'scheduled'}
          <p>Scheduled for {new Date(item.dueAt || 0).toLocaleString()}, but automatic dispatch is paused until the native send crash is resolved.</p>
          <button type="button" on:click={() => updateDraft(item.id,{status:'review',dueAt:undefined})}>Edit scheduled message</button>
        {:else if item.status === 'analyzing'}
          <p>Analyzing the recent conversation. Your message has NOT been sent.</p>
        {:else}
          {#if item.warning}<p class="warn">{item.warning}</p>{/if}
          {#if item.hint}<p class="hint">{item.hint}</p>{/if}
          {#if item.recommendation === 'hold' && !item.warning}<p class="warn">AI recommends waiting rather than sending immediately.</p>{/if}
          <textarea rows="2" aria-label="Reviewed message"
            value={editing[item.id] ?? item.text}
            on:input={(event) => { editing[item.id]=(event.currentTarget as HTMLTextAreaElement).value; editing=editing; }} />
          {#if item.suggestion && item.suggestion !== item.text}
            <button type="button" class="suggestion" on:click={() => acceptSuggestion(item)}>Use AI rewrite: {item.suggestion}</button>
          {/if}
          <div class="controls">
            <button type="button" class="primary" disabled={item.status==='sending'} on:click={() => sendNow(item)}>Send now</button>
            <label><input type="number" min="1" max="10080" bind:value={delayMinutes} aria-label="Delay minutes" /> min</label>
            <button type="button" disabled>Send later (paused)</button>
          </div>
          {#if item.delayMinutes > 0}
            <button type="button" class="hint" disabled>AI suggests waiting {item.delayMinutes} min (scheduling paused)</button>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}
<style>
  .outbox { max-height:40vh; overflow-y:auto; background:var(--paper); border-top:1px solid var(--border-color); }
  .draft { padding:8px 12px; display:grid; gap:6px; border-bottom:1px solid var(--border-color); }
  .heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .heading strong { color:var(--wa-green-dark); font-size:.8rem; }
  p { margin:0; font-size:.77rem; color:var(--muted); }
  .warn { color:#b65b00; }
  textarea { width:100%; min-height:58px; resize:vertical; background:var(--border-color); color:var(--ink); border:0; border-radius:8px; padding:8px; }
  button { border:0; border-radius:9px; padding:7px 9px; background:var(--border-color); color:var(--ink); font:inherit; font-size:.76rem; cursor:pointer; }
  button.primary { background:var(--wa-green-dark); color:white; font-weight:600; }
  button:disabled { opacity:.5; }
  .suggestion { text-align:left; color:var(--wa-green-dark); overflow-wrap:anywhere; }
  .controls { display:flex; flex-wrap:wrap; align-items:center; gap:7px; }
  .controls label { font-size:.76rem; display:flex; align-items:center; gap:2px; }
  .controls input { width:53px; min-height:34px; border:1px solid var(--border-color); border-radius:6px; color:var(--ink); background:var(--paper); }
  .cancel { color:#b3261e; }
</style>
