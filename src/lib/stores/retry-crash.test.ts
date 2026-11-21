import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { appState, quarantineInterruptedOutgoing, retryQueuedMessages, setConnection } from './app';
import type { ChatMessage } from '$lib/api/types';
import { getDiagnosticEntries } from '$lib/diagnostics/logger';

function outgoing(id: string, status: ChatMessage['status']): ChatMessage {
  return {
    id, chatId: 'crash-test@s.whatsapp.net', senderId: 'me',
    text: 'Delivery state uncertain', timestamp: 100, fromMe: true, status
  };
}

describe('crash-loop send quarantine', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('quarantines previously queued messages but leaves delivered messages unchanged', () => {
    const prior = [outgoing('queued', 'queued'), outgoing('sent', 'sent'), outgoing('failed', 'failed')];
    const saved = { 'crash-test@s.whatsapp.net': prior };
    const recovered = quarantineInterruptedOutgoing(saved);
    expect(recovered['crash-test@s.whatsapp.net'].map(m => m.status))
      .toEqual(['failed', 'sent', 'failed']);
    expect(prior[0].status).toBe('queued');
    expect(recovered['crash-test@s.whatsapp.net'][0].text).toBe(prior[0].text);
    expect(recovered['crash-test@s.whatsapp.net'][0].id).toBe(prior[0].id);
  });

  it('does not automatically retry failed messages when the session connects', async () => {
    vi.useFakeTimers();
    appState.update(state => ({
      ...state,
      messages: { ...state.messages, 'crash-test@s.whatsapp.net': [outgoing('interrupted', 'failed')] }
    }));
    const before = getDiagnosticEntries().filter(e => e.event === 'retry_started').length;
    setConnection({ connected: true, message: 'Connected' });
    await vi.advanceTimersByTimeAsync(1300);
    const after = getDiagnosticEntries().filter(e => e.event === 'retry_started').length;
    expect(after).toBe(before);
    expect(get(appState).messages['crash-test@s.whatsapp.net'][0].status).toBe('failed');
  });

  it('legacy bulk retry API refuses to send automatically', async () => {
    const before = getDiagnosticEntries().filter(e => e.event === 'automatic_retry_blocked').length;
    await retryQueuedMessages();
    const after = getDiagnosticEntries().filter(e => e.event === 'automatic_retry_blocked').length;
    expect(after).toBe(before + 1);
  });
});
