import { describe, expect, it } from 'vitest';
import { shouldSendTypingPresence } from './typing-presence';

describe('native typing presence safety', () => {
  it('never calls native WhatsApp chatstate on Android 11', () => {
    expect(shouldSendTypingPresence(true, false, 100000, 0)).toBe(false);
  });
  it('suppresses typing on a blocked chat', () => {
    expect(shouldSendTypingPresence(false, true, 100000, 0)).toBe(false);
  });
  it('limits desktop events to at least four seconds apart', () => {
    expect(shouldSendTypingPresence(false, false, 5000, 0)).toBe(true);
    expect(shouldSendTypingPresence(false, false, 7000, 5000)).toBe(false);
    expect(shouldSendTypingPresence(false, false, 9000, 5000)).toBe(true);
  });
});
