<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';
  import { generateImage } from '$lib/ai/openrouter';
  import { recordDiagnosticError } from '$lib/diagnostics/logger';
  export let chatId:string;
  export let messages:ChatMessage[]=[];
  export let onShare:(file:File)=>void=()=>undefined;
  let pieces:string[]=[];
  let idea='',image='',error='',busy=false,previousChat='';
  $: if(chatId!==previousChat){
    previousChat=chatId;image='';idea='';
    try{const a=JSON.parse(localStorage.getItem('whatsmo.collage.'+chatId)||'[]');pieces=Array.isArray(a)?a.slice(0,8).filter((v:unknown):v is string=>typeof v==='string'):[];}
    catch{pieces=[];}
  }
  function persist():void{try{localStorage.setItem('whatsmo.collage.'+chatId,JSON.stringify(pieces));}catch{}}
  function add():void{
    if(!idea.trim()||pieces.length>=8)return;
    pieces=[...pieces,idea.trim().slice(0,260)];idea='';persist();
  }
  function useLastReply():void{
    const recent=[...messages].reverse().find(m=>!m.fromMe&&m.text?.trim());
    if(recent && pieces.length<8){pieces=[...pieces,(recent.text||'').slice(0,260)];persist();}
  }
  function remove(index:number):void{pieces=pieces.filter((_,i)=>i!==index);persist();}
  async function make():Promise<void>{
    if(!pieces.length)return;
    busy=true;error='';
    try{
      const result=await generateImage(
        'Create one visually coherent humorous illustrated collage, a shared imaginary scene. '+
        'Connect all these contributions as interesting elements of the same playful scene. '+
        'No photos of real people, no phone numbers or names. Painterly detailed editorial illustration. '+
        'Collaborative scene contributions:\n'+pieces.map((x,i)=>(i+1)+'. '+x).join('\n')
      );
      image=result.image||'';
      if(!image)throw Error('No image returned');
    }catch(e){error=e instanceof Error?e.message:'Image generation failed';recordDiagnosticError('games','collage_failed',e);}
    finally{busy=false;}
  }
  async function share():Promise<void>{
    if(!image)return;
    try{
      const r=await fetch(image);if(!r.ok)throw Error('Could not load image');
      const blob=await r.blob();onShare(new File([blob],'shared-collage.png',{type:blob.type||'image/png'}));
    }catch(e){error=e instanceof Error?e.message:'Could not share image';}
  }
</script>
<section class="game">
  <h4>Shared Collage</h4>
  <p>Build a scene together: add your ideas or use your partner's latest chat message. Generate and share the resulting picture.</p>
  <div class="compose">
    <input bind:value={idea} maxlength="260" placeholder="An unusual detail for our scene…" aria-label="Collage contribution"/>
    <button on:click={add} disabled={!idea.trim()||pieces.length>=8}>Add</button>
  </div>
  <button on:click={useLastReply} disabled={pieces.length>=8||!messages.some(m=>!m.fromMe&&m.text)}>Use latest incoming message</button>
  <div class="pieces">
    {#each pieces as piece,i}
      <div class="piece"><span>{i+1}. {piece}</span><button on:click={()=>remove(i)}>×</button></div>
    {/each}
  </div>
  <button class="primary" disabled={busy||pieces.length===0} on:click={make}>{busy?'Creating collage…':'Generate shared collage'}</button>
  {#if error}<p class="error">{error}</p>{/if}
  {#if image}
    <img src={image} alt="AI generated collaborative collage"/>
    <button class="primary" on:click={share}>Share collage in chat</button>
  {/if}
</section>
<style>
.game{display:grid;gap:8px;padding:10px;background:var(--paper);color:var(--ink);border-radius:10px}
h4{margin:0;font-size:.9rem}p{margin:0;font-size:.76rem;color:var(--muted)}
.compose{display:flex;gap:6px}.compose input{min-width:0;flex:1}
input{background:var(--paper);color:var(--ink);padding:8px;border:1px solid var(--border-color);border-radius:9px;font:inherit;font-size:.8rem}
button{padding:8px;border:0;border-radius:9px;background:var(--border-color);color:var(--ink);font:inherit;font-size:.78rem}
button.primary{background:var(--wa-green-dark);color:white}button:disabled{opacity:.5}
.pieces{display:grid;gap:3px}.piece{display:flex;align-items:center;gap:6px;background:var(--border-color);border-radius:7px;padding:3px 6px}
.piece span{flex:1;overflow-wrap:anywhere;font-size:.75rem}.piece button{flex-shrink:0;font-size:1rem}
img{width:100%;max-height:34vh;object-fit:contain;border-radius:8px}.error{color:#b3261e}
</style>