<script lang="ts">
 import type { ChatMessage } from '$lib/api/types';
 import { generateImage } from '$lib/ai/openrouter';
 import { recordDiagnosticError } from '$lib/diagnostics/logger';
 export let messages: ChatMessage[] = [];
 export let onShare: (file: File) => void = () => undefined;
 let busy=false, image='', error='', idea='';
 let lastPrompt='';
 async function create():Promise<void>{
   busy=true;error='';image='';
   const context=messages.filter(m=>Boolean(m.text)).slice(-8)
     .map(m=>(m.fromMe?'Me: ':'Other: ')+(m.text||'').slice(0,220)).join('\n');
   lastPrompt='Create a playful, gently ironic, tasteful single-panel cartoon about this fictionalized conversation. '+
     'Do not draw real identifiable people, screenshots, exact contact names or phone numbers. '+
     'Use a charming hand-drawn editorial style, readable visual storytelling, no text-heavy labels. '+
     'Additional idea: '+idea.slice(0,350)+'\nConversation summary for inspiration:\n'+context;
   try{
     const result=await generateImage(lastPrompt);
     image=result.image||'';
     if(!image)throw Error('Image result empty');
   }catch(e){error=e instanceof Error?e.message:'Could not generate cartoon';recordDiagnosticError('games','cartoon_failed',e);}
   finally{busy=false;}
 }
 async function share():Promise<void>{
   if(!image)return;
   try{
     const response=await fetch(image);
     if(!response.ok)throw Error('Unable to read generated image');
     const blob=await response.blob();
     onShare(new File([blob],'chat-cartoon.png',{type:blob.type||'image/png'}));
   }catch(e){error='Could not prepare image for WhatsApp. '+(e instanceof Error?e.message:'');}
 }
</script>
<section class="game">
  <h4>Chat to Cartoon</h4>
  <p>Create a light-hearted cartoon from up to eight recent text messages. You review the image before sharing it.</p>
  <input bind:value={idea} placeholder="Optional twist: a detective mystery..." aria-label="Cartoon idea"/>
  <button on:click={create} disabled={busy}>{busy?'Generating image…':'Generate cartoon'}</button>
  {#if error}<p class="error">{error}</p>{/if}
  {#if image}
    <img src={image} alt="AI generated humorous conversation cartoon"/>
    <button class="share" on:click={share}>Share image in this chat</button>
  {/if}
</section>
<style>
.game{display:grid;gap:8px;padding:10px;background:var(--paper);color:var(--ink);border-radius:10px}
h4{margin:0;font-size:.9rem}p{margin:0;font-size:.77rem;color:var(--muted)}
input{min-height:38px;border:1px solid var(--border-color);padding:8px;border-radius:9px;background:var(--paper);color:var(--ink)}
button{background:var(--border-color);border:0;border-radius:9px;padding:10px;color:var(--ink);font:inherit;font-size:.81rem}
button.share{background:var(--wa-green-dark);color:white}
button:disabled{opacity:.55}img{width:100%;max-height:34vh;object-fit:contain;border-radius:8px}
.error{color:#b3261e}
</style>