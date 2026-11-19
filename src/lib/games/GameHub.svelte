<script lang="ts">
  import type { ChatMessage } from '$lib/api/types';
  import ChatCartoon from './ChatCartoon.svelte';
  import SharedCollage from './SharedCollage.svelte';
  export let chatId:string;
  export let messages:ChatMessage[]=[];
  export let onShare:(file:File)=>void=()=>undefined;
  let active:'cartoon'|'collage'='cartoon';
</script>
<div class="games" aria-label="Social creative games">
  <div class="tabs">
    <button class:active={active==='cartoon'} on:click={()=>active='cartoon'}>Chat cartoon</button>
    <button class:active={active==='collage'} on:click={()=>active='collage'}>Shared collage</button>
  </div>
  {#if active==='cartoon'}
    <ChatCartoon {messages} {onShare}/>
  {:else}
    <SharedCollage {chatId} {messages} {onShare}/>
  {/if}
  <small>AI images may incur costs. Generation happens only when you press Generate; nothing is shared until you confirm it.</small>
</div>
<style>
.games{background:var(--paper);max-height:57vh;overflow-y:auto;border-top:1px solid var(--border-color);padding:5px}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px}
.tabs button{border:0;background:var(--border-color);border-radius:8px;padding:9px;color:var(--ink)}
.tabs button.active{background:var(--wa-green-dark);color:white}
small{display:block;padding:7px;font-size:.72rem;color:var(--muted)}
</style>