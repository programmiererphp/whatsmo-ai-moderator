import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { appState, sendMessage } from '$lib/stores/app';
import {
  outbox, cancelDraft, dispatchDraft, isModerated, noteIncomingMessage,
  scheduleDraft, setModerated, updateDraft, deliverDue
} from './outbox';

vi.mock('$lib/ai/openrouter', () => ({
  generateText: vi.fn(async () => ({
    text: '{"decision":"rewrite","hint":"Keep it short.","rewrite":"Hi!","delayMinutes":5}',
    costUsd: 0.0001, estimated: true
  }))
}));

describe('selected-chat moderation gate', () => {
  beforeEach(() => {
    for (const draft of get(outbox)) cancelDraft(draft.id);
    setModerated('test@s.whatsapp.net', false);
  });
  it('does not intercept chats without AI coach enabled', () => {
    expect(isModerated('test@s.whatsapp.net')).toBe(false);
  });
  it('intercepts Send without transmission or optimistic sent bubbles', async () => {
    const chatId = 'test@s.whatsapp.net';
    setModerated(chatId, true);
    const previous = get(appState).messages[chatId]?.length || 0;
    const sent = await sendMessage(chatId, 'Please review this');
    expect(sent).toBe(false);
    const held = get(outbox).find(d => d.chatId === chatId);
    expect(held?.text).toBe('Please review this');
    expect(get(appState).messages[chatId]?.length || 0).toBe(previous);
  });
  it('pauses a scheduled message when a reply arrives', async () => {
    const chatId = 'test@s.whatsapp.net';
    setModerated(chatId, true);
    await sendMessage(chatId,'hello');
    const draft = get(outbox).find(d => d.chatId === chatId);
    expect(draft).toBeDefined();
    if (!draft) return;
    updateDraft(draft.id,{status:'review'});
    scheduleDraft(draft.id,30);
    expect(get(outbox).find(d=>d.id===draft.id)?.status).toBe('scheduled');
    noteIncomingMessage(chatId);
    expect(get(outbox).find(d=>d.id===draft.id)?.status).toBe('review');
    expect(get(outbox).find(d=>d.id===draft.id)?.dueAt).toBeUndefined();
  });
  it('only dispatches after explicit approval and handles failures', async () => {
    setModerated('test@s.whatsapp.net',true);
    await sendMessage('test@s.whatsapp.net','Hello again');
    const draft=get(outbox).find(d=>d.text==='Hello again');
    expect(draft).toBeDefined();
    if(!draft)return;
    updateDraft(draft.id,{status:'review'});
    const sender=vi.fn(async()=>true);
    expect(await dispatchDraft(draft.id,sender)).toBe(true);
    expect(sender).toHaveBeenCalledOnce();
    expect(get(outbox).some(d=>d.id===draft.id)).toBe(false);
  });
  it('does not send delayed drafts before their due time', async () => {
    setModerated('test@s.whatsapp.net',true);
    await sendMessage('test@s.whatsapp.net','Not yet');
    const draft=get(outbox).find(d=>d.text==='Not yet');
    if(!draft)throw Error('No draft');
    updateDraft(draft.id,{status:'review'});
    scheduleDraft(draft.id,10);
    const sender=vi.fn(async()=>true);
    await deliverDue(sender);
    expect(sender).not.toHaveBeenCalled();
  });
});
