<script lang="ts">
 import { aiSettings,updateAiSettings } from '$lib/ai/settings';
 import { spent } from '$lib/ai/openrouter';
 let advanced=false;
 let showKey=false;
 let spend=spent();
 function numeric(key:'maxInputChars'|'maxOutputTokens'|'timeoutSeconds'|'perCallUsd'|'sessionUsd'|'imageCallUsd'|'textFeatureUsd'|'imageFeatureUsd'|'inputUsdPerMillion'|'outputUsdPerMillion',value:string):void{
   const number=Number(value);
   if(Number.isFinite(number)&&number>0)updateAiSettings({[key]:number});
 }
 function updateText(key:'apiKey'|'textModel'|'imageModel'|'instruction',v:string):void{
   updateAiSettings({[key]:v});
 }
</script>
<section class="ai-settings">
  <h3>AI coach & creative games</h3>
  <p>AI suggestions are only used in chats where you enable Coach. Up to twelve recent messages are sent to OpenRouter for review. Image generation uses a separate image model.</p>
  <label>OpenRouter API key
    <div class="key"><input type={showKey?'text':'password'} autocomplete="off" value={$aiSettings.apiKey}
      on:change={e=>updateText('apiKey',e.currentTarget.value)} placeholder="sk-or-v1-…" />
      <button type="button" on:click={()=>showKey=!showKey}>{showKey?'Hide':'Show'}</button>
    </div>
  </label>
  <label>Text AI model
    <select value={$aiSettings.textModel} on:change={e=>updateText('textModel',e.currentTarget.value)}>
      <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (low cost)</option>
      <option value="openrouter/auto">OpenRouter Auto (price may vary)</option>
      <option value="openai/gpt-5.2">OpenAI GPT-5.2 (premium)</option>
      {#if !['google/gemini-2.5-flash-lite','openrouter/auto','openai/gpt-5.2'].includes($aiSettings.textModel)}
        <option value={$aiSettings.textModel}>Custom: {$aiSettings.textModel}</option>
      {/if}
    </select>
  </label>
  <label>Custom text model ID
    <input value={$aiSettings.textModel} on:change={e=>updateText('textModel',e.currentTarget.value)} placeholder="author/model-id"/>
  </label>
  <label>Image generation model ID
    <input value={$aiSettings.imageModel} on:change={e=>updateText('imageModel',e.currentTarget.value)} placeholder="google/gemini-2.5-flash-image"/>
  </label>
  <label>Coach instruction (editable)
    <textarea rows="4" value={$aiSettings.instruction} on:change={e=>updateText('instruction',e.currentTarget.value)} />
  </label>
  <p class="spent">Estimated/reported session spend:  {spend.total.toFixed(4)} USD · text {spend.text.toFixed(4)} · images {spend.image.toFixed(4)}</p>
  <button type="button" class="advanced-toggle" on:click={()=>advanced=!advanced}>
    {advanced?'Hide advanced cost controls':'Advanced: cost limits and request settings'}
  </button>
  {#if advanced}
    <div class="controls">
      <label>Text call max (USD)<input type="number" step=".001" min=".001" value={$aiSettings.perCallUsd} on:change={e=>numeric('perCallUsd',e.currentTarget.value)}/></label>
      <label>Image call estimate/max (USD)<input type="number" step=".01" min=".01" value={$aiSettings.imageCallUsd} on:change={e=>numeric('imageCallUsd',e.currentTarget.value)}/></label>
      <label>Session cap (USD)<input type="number" step=".01" min=".01" value={$aiSettings.sessionUsd} on:change={e=>numeric('sessionUsd',e.currentTarget.value)}/></label>
      <label>Text feature cap (USD)<input type="number" step=".01" min=".01" value={$aiSettings.textFeatureUsd} on:change={e=>numeric('textFeatureUsd',e.currentTarget.value)}/></label>
      <label>Image feature cap (USD)<input type="number" step=".01" min=".01" value={$aiSettings.imageFeatureUsd} on:change={e=>numeric('imageFeatureUsd',e.currentTarget.value)}/></label>
      <label>Maximum input chars<input type="number" min="500" max="20000" value={$aiSettings.maxInputChars} on:change={e=>numeric('maxInputChars',e.currentTarget.value)}/></label>
      <label>Maximum output tokens<input type="number" min="100" max="4000" value={$aiSettings.maxOutputTokens} on:change={e=>numeric('maxOutputTokens',e.currentTarget.value)}/></label>
      <label>Timeout seconds<input type="number" min="10" max="120" value={$aiSettings.timeoutSeconds} on:change={e=>numeric('timeoutSeconds',e.currentTarget.value)}/></label>
      <label>Input price per 1M tokens (USD)<input type="number" step=".01" min=".01" value={$aiSettings.inputUsdPerMillion} on:change={e=>numeric('inputUsdPerMillion',e.currentTarget.value)}/></label>
      <label>Output price per 1M tokens (USD)<input type="number" step=".01" min=".01" value={$aiSettings.outputUsdPerMillion} on:change={e=>numeric('outputUsdPerMillion',e.currentTarget.value)}/></label>
      <label class="check"><input type="checkbox" checked={$aiSettings.allowUnknownPrice}
        on:change={e=>updateAiSettings({allowUnknownPrice:e.currentTarget.checked})}/> Allow custom model price estimates</label>
    </div>
    <p>Limits use estimates before a request and provider-reported cost when available. They cannot guarantee your actual bill, especially for images and custom models.</p>
  {/if}
</section>
<style>
.ai-settings{display:grid;gap:9px;padding:15px 20px;border-bottom:8px solid var(--app-bg);color:var(--ink)}
h3{font-size:.9rem;margin:0;color:var(--wa-green-dark)}
p{color:var(--muted);font-size:.77rem;line-height:1.4;margin:0}
label{display:grid;gap:4px;font-size:.8rem}
input,select,textarea{width:100%;min-width:0;border:1px solid var(--border-color);background:var(--paper);border-radius:9px;padding:9px;color:var(--ink);font:inherit;font-size:.82rem}
textarea{resize:vertical;min-height:80px}
.key{display:flex;gap:4px}.key input{flex:1}.key button{flex:0 0 auto}
button{border:0;background:var(--border-color);color:var(--ink);padding:9px;border-radius:9px;font:inherit;font-size:.8rem}
.spent{overflow-wrap:anywhere;color:var(--wa-green-dark)}
.controls{display:grid;gap:10px;padding:10px;border-radius:10px;background:var(--app-bg)}
.check{display:flex;align-items:center;gap:8px}.check input{width:19px;height:19px}
</style>