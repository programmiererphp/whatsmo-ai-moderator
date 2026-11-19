import { writable, get } from 'svelte/store';
import type { ChatMessage } from '$lib/api/types';
import { recordDiagnostic, recordDiagnosticError } from '$lib/diagnostics/logger';
import { generateText } from '$lib/ai/openrouter';
import { aiSettings } from '$lib/ai/settings';

const CHAT_KEY='whatsmo.ai.moderated-chats.v1', QUEUE_KEY='whatsmo.ai.outbox.v1';
export type DraftStatus='analyzing'|'review'|'scheduled'|'sending';
export interface OutboxDraft {
  id:string; chatId:string; text:string; createdAt:number; status:DraftStatus;
  hint:string; suggestion:string; recommendation:'send'|'rewrite'|'hold';
  delayMinutes:number; dueAt?:number; warning?:string;
  quote?: {id:string; senderId:string; senderName?:string; text?:string};
}
function read<T>(key:string, fallback:T):T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
}
const enabled=read<string[]>(CHAT_KEY, []);
export const moderatedChats=writable<string[]>(Array.isArray(enabled)?enabled:[]);
export function isModerated(chatId:string):boolean{return get(moderatedChats).includes(chatId);}
export function setModerated(chatId:string,value:boolean):void{
  moderatedChats.update(list=>{
    const next=value?Array.from(new Set([...list,chatId])):list.filter(x=>x!==chatId);
    try {localStorage.setItem(CHAT_KEY,JSON.stringify(next));}catch{}
    recordDiagnostic('info','moderator',value?'chat_enabled':'chat_disabled');
    return next;
  });
}
const saved=read<OutboxDraft[]>(QUEUE_KEY,[]);
export const outbox=writable<OutboxDraft[]>(Array.isArray(saved)?saved.map(x=>({
  ...x,status:x.status==='analyzing'||x.status==='sending'?'review':x.status
})).slice(-60):[]);
function change(fn:(items:OutboxDraft[])=>OutboxDraft[]):void {
  outbox.update(items=>{
    const next=fn(items).slice(-60);
    try{localStorage.setItem(QUEUE_KEY,JSON.stringify(next));}
    catch{recordDiagnostic('warn','moderator','queue_storage_failed');}
    return next;
  });
}
export function queueDraft(chatId:string,text:string,quote?:ChatMessage,history:ChatMessage[]=[]):void{
  const item:OutboxDraft={
    id:crypto.randomUUID(),chatId,text:text.trim(),createdAt:Date.now(),status:'analyzing',
    hint:'',suggestion:text.trim(),recommendation:'send',delayMinutes:0,
    ...(quote?{quote:{id:quote.id,senderId:quote.senderId,senderName:quote.senderName,text:quote.text?.slice(0,300)}}:{})
  };
  change(x=>[...x,item]);
  recordDiagnostic('info','moderator','message_intercepted',{characters:text.length});
  void analyzeDraft(item.id,history);
}
export function updateDraft(id:string,patch:Partial<Pick<OutboxDraft,'text'|'status'|'dueAt'|'hint'|'suggestion'|'warning'>>):void{
  change(items=>items.map(x=>x.id===id?{...x,...patch}:x));
}
export function cancelDraft(id:string):void{
  change(x=>x.filter(y=>y.id!==id));
  recordDiagnostic('info','moderator','draft_cancelled');
}
export function scheduleDraft(id:string,minutes:number):void{
  if(!Number.isFinite(minutes)||minutes<1||minutes>10080)throw Error('Delay must be 1–10080 minutes.');
  change(x=>x.map(d=>d.id===id?{...d,status:'scheduled',dueAt:Date.now()+Math.floor(minutes*60000),warning:undefined}:d));
  recordDiagnostic('info','moderator','draft_scheduled',{minutes});
}
export function holdForReview(id:string,warning?:string):void{
  change(x=>x.map(d=>d.id===id?{...d,status:'review',dueAt:undefined,warning}:d));
}
export function noteIncomingMessage(chatId:string):void{
  const count=get(outbox).filter(x=>x.chatId===chatId&&x.status==='scheduled').length;
  if(!count)return;
  change(x=>x.map(d=>d.chatId===chatId&&d.status==='scheduled'
    ?{...d,status:'review',dueAt:undefined,warning:'New reply received; scheduled send paused.'}:d));
  recordDiagnostic('info','moderator','scheduled_paused_by_reply',{count});
}
async function analyzeDraft(id:string,history:ChatMessage[]):Promise<void>{
  const draft=get(outbox).find(x=>x.id===id); if(!draft)return;
  try{
    const cfg=get(aiSettings);
    const context=history.slice(-12).map(m=>(m.fromMe?'Me: ':'Other: ')+(m.text||'[media]').slice(0,320)).join('\n');
    const response=await generateText(cfg.instruction,'Recent conversation:\n'+context+'\n\nOutgoing draft:\n'+draft.text);
    const raw=(response.text||'').trim();
    const brace=raw.indexOf('{'),last=raw.lastIndexOf('}');
    if(brace<0||last<=brace)throw Error('The AI returned invalid JSON.');
    const p=JSON.parse(raw.slice(brace,last+1)) as {decision?:string;hint?:string;rewrite?:string;delayMinutes?:number};
    const recommendation=p.decision==='hold'||p.decision==='rewrite'?p.decision:'send';
    change(x=>x.map(d=>d.id===id?{
      ...d,status:'review',hint:String(p.hint||'').slice(0,500),
      suggestion:String(p.rewrite||d.text).slice(0,2500),recommendation,
      delayMinutes:Math.min(10080,Math.max(0,Number(p.delayMinutes)||0))
    }:d));
    recordDiagnostic('info','moderator','review_ready',{recommendation});
  }catch(error){
    recordDiagnosticError('moderator','ai_review_failed',error);
    change(x=>x.map(d=>d.id===id?{
      ...d,status:'review',warning:error instanceof Error?error.message:'AI review failed',
      hint:'AI review unavailable. You can still edit or approve the original text.'
    }:d));
  }
}
export async function dispatchDraft(id:string,send:(d:OutboxDraft)=>Promise<boolean>):Promise<boolean>{
  const d=get(outbox).find(x=>x.id===id);
  if(!d||d.status==='analyzing'||d.status==='sending')return false;
  updateDraft(id,{status:'sending'});
  try{
    if(await send(d)){cancelDraft(id);recordDiagnostic('info','moderator','message_sent');return true;}
    holdForReview(id,'Send not confirmed. Review and retry.');
  }catch(error){
    recordDiagnosticError('moderator','send_failed',error);
    holdForReview(id,'Send failed; check connection and retry.');
  }
  return false;
}
export async function deliverDue(send:(d:OutboxDraft)=>Promise<boolean>):Promise<void>{
  const due=get(outbox).filter(d=>d.status==='scheduled'&&(d.dueAt||0)<=Date.now()).slice(0,4);
  for(const d of due)await dispatchDraft(d.id,send);
}
