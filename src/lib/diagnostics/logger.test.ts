import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDiagnosticEntries,
  formatDiagnosticReport,
  getDiagnosticEntries,
  recordDiagnostic,
  recordDiagnosticError,
  redactSensitive
} from './logger';

describe('diagnostic logging and privacy', () => {
  beforeEach(() => clearDiagnosticEntries());

  it('redacts common phone numbers, WhatsApp identifiers, emails, URLs and API tokens', () => {
    const original = 'Call +4917012345678; 123456789012345@lid; ' +
      'hello@example.org; https://example.org/?token=secret; ' +
      'Bearer aabbccddeeff112233; sk-ABCDEFGHIJKLMNOP123';
    const clean = redactSensitive(original);
    for (const privateValue of [
      '4917012345678', '123456789012345', 'hello@example.org',
      'example.org/?token', 'aabbccddeeff112233', 'sk-ABCDEFGHIJKLMNOP123'
    ]) {
      expect(clean).not.toContain(privateValue);
    }
  });

  it('stores only 500 recent entries and never writes an object payload', () => {
    for (let i = 0; i < 520; i++) {
      recordDiagnostic('info', 'test', 'iteration', {
        iteration: i,
        rawMessageObject: { text: 'private message' }
      });
    }
    const entries = getDiagnosticEntries();
    expect(entries).toHaveLength(500);
    expect(entries[0].details?.iteration).toBe(20);
    expect(formatDiagnosticReport()).not.toContain('private message');
  });

  it('captures sanitized error details and protects native-log exports', () => {
    recordDiagnosticError('native', 'send_failed', new Error('failure for +4917012345678'));
    expect(JSON.stringify(getDiagnosticEntries())).not.toContain('4917012345678');
    const exported = formatDiagnosticReport('FATAL: API token=abcdefgh12345 for +4917012345678');
    expect(exported).not.toContain('abcdefgh12345');
    expect(exported).not.toContain('4917012345678');
  });

  it('filters dynamic event names to avoid storing accidental message content', () => {
    recordDiagnostic('debug', 'test', 'user says secret secret', { count: 2 });
    const e = getDiagnosticEntries().at(-1);
    expect(e?.event).not.toContain(' ');
  });
});
