import { writable } from 'svelte/store';

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
export interface DiagnosticEntry {
  timestamp: string;
  session: string;
  level: DiagnosticLevel;
  area: string;
  event: string;
  details?: Record<string, string | number | boolean | null>;
}

const LOG_KEY = 'whatsmo.diagnostics.entries.v1';
const SESSION_KEY = 'whatsmo.diagnostics.active-session.v1';
const VERBOSE_KEY = 'whatsmo.diagnostics.verbose.v1';
const MAX_ENTRIES = 500;
const MAX_DETAIL_LENGTH = 280;
const REDACTED = '[redacted]';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Redact likely identities and secrets before placing diagnostics in storage or exports.
 * Error strings are best-effort redacted; never pass chat text, message IDs or API keys.
 */
export function redactSensitive(input: string): string {
  return input
    .replace(/(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/-]{8,})/gi, REDACTED)
    .replace(/(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s"',;}]+/gi, REDACTED)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
    .replace(/[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/[A-Za-z0-9+_.:-]+@(?:lid|g\.us|s\.whatsapp\.net)/gi, '[chat-id]')
    .replace(/\+?\d[\d() .-]{7,}\d/g, '[number]')
    .replace(/\b[A-Za-z0-9_-]{64,}\b/g, '[long-value]');
}

function cleanName(value: string): string {
  // Event and area names are controlled by our code; remove dynamic data.
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
}

function cleanDetails(details?: Record<string, unknown>): DiagnosticEntry['details'] {
  if (!details) return undefined;
  const clean: NonNullable<DiagnosticEntry['details']> = {};
  for (const [key, value] of Object.entries(details).slice(0, 12)) {
    // Ignore any object/array: it may contain private chat messages or media.
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      clean[cleanName(key)] = typeof value === 'number' && !Number.isFinite(value) ? null : value;
    } else if (typeof value === 'string') {
      clean[cleanName(key)] = redactSensitive(value).slice(0, MAX_DETAIL_LENGTH);
    }
  }
  return clean;
}

function loadEntries(): DiagnosticEntry[] {
  try {
    const raw = storage()?.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DiagnosticEntry =>
      Boolean(item) && typeof item === 'object' &&
      typeof item.timestamp === 'string' && typeof item.event === 'string' &&
      ['debug', 'info', 'warn', 'error'].includes(item.level)
    ).slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

let entries = loadEntries();
export const diagnosticEntries = writable<DiagnosticEntry[]>(entries);
let sessionId = 'not-started';
let initialized = false;
let verbose = storage()?.getItem(VERBOSE_KEY) !== 'false';
export const diagnosticVerbose = writable<boolean>(verbose);

function persist(): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // Logging must never crash or block the messenger if storage is unavailable.
    try {
      entries = entries.slice(-80);
      target.setItem(LOG_KEY, JSON.stringify(entries));
    } catch { /* storage disabled/full */ }
  }
}

export function recordDiagnostic(
  level: DiagnosticLevel,
  area: string,
  event: string,
  details?: Record<string, unknown>
): void {
  try {
    if (level === 'debug' && !verbose) return;
    const entry: DiagnosticEntry = {
      timestamp: new Date().toISOString(),
      session: sessionId,
      level,
      area: cleanName(area),
      event: cleanName(event),
      ...(details ? { details: cleanDetails(details) } : {})
    };
    entries = [...entries, entry].slice(-MAX_ENTRIES);
    diagnosticEntries.set(entries);
    persist();
  } catch {
    // All diagnostics are non-critical.
  }
}

export function recordDiagnosticError(area: string, event: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  recordDiagnostic('error', area, event, {
    message: redactSensitive(message).slice(0, MAX_DETAIL_LENGTH),
    ...(stack ? { stack: redactSensitive(stack).slice(0, MAX_DETAIL_LENGTH) } : {})
  });
}

export function setDiagnosticVerbose(enabled: boolean): void {
  verbose = enabled;
  diagnosticVerbose.set(enabled);
  try { storage()?.setItem(VERBOSE_KEY, String(enabled)); } catch { /* ignore */ }
  recordDiagnostic('info', 'diagnostics', 'verbose_changed', { enabled });
}

export function clearDiagnosticEntries(): void {
  entries = [];
  diagnosticEntries.set(entries);
  try { storage()?.removeItem(LOG_KEY); } catch { /* ignore */ }
}

export function getDiagnosticEntries(): DiagnosticEntry[] {
  return [...entries];
}

function safeButtonLabel(button: HTMLButtonElement): string {
  const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
  // Only explicitly allowlisted controls are stored. Dynamic contact names,
  // messages, codes and phone numbers are never captured as button labels.
  const known = new Set([
    'Send message', 'Voice message', 'Back to chats', 'Attach media',
    'Get Code', 'Generate QR Code', 'Try again', 'Settings',
    'Chats', 'Updates', 'Devices', 'Copy diagnostics',
    'Export diagnostics', 'Clear diagnostics', 'Refresh native logs'
  ]);
  return known.has(label) ? label : 'other_control';
}

export function initDiagnostics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const target = storage();
  try {
    const previous = target?.getItem(SESSION_KEY);
    if (previous) {
      const parsed: unknown = JSON.parse(previous);
      if (parsed && typeof parsed === 'object' && 'active' in parsed && parsed.active === true) {
        recordDiagnostic('warn', 'lifecycle', 'previous_session_unclosed', {
          reason: 'Could be OS termination, process crash or force stop; not definitive',
          lastSeen: 'lastSeen' in parsed ? String(parsed.lastSeen) : ''
        });
      }
    }
  } catch { /* ignore */ }

  function heartbeat(): void {
    try {
      target?.setItem(SESSION_KEY, JSON.stringify({
        active: true, session: sessionId, lastSeen: new Date().toISOString()
      }));
    } catch { /* ignore */ }
  }
  heartbeat();
  recordDiagnostic('info', 'lifecycle', 'app_started', {
    platform: navigator.platform ?? 'unknown',
    language: navigator.language ?? 'unknown',
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  window.setInterval(heartbeat, 15000);

  window.addEventListener('error', (event) => {
    recordDiagnosticError('javascript', 'uncaught_error',
      event.error ?? new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordDiagnosticError('javascript', 'unhandled_rejection', event.reason);
  });
  window.addEventListener('pagehide', () => {
    recordDiagnostic('info', 'lifecycle', 'page_hidden');
    try { target?.setItem(SESSION_KEY, JSON.stringify({
      active: false, session: sessionId, lastSeen: new Date().toISOString()
    })); } catch { /* ignore */ }
  });
  document.addEventListener('visibilitychange', () => {
    recordDiagnostic('info', 'lifecycle', document.hidden ? 'background' : 'foreground');
    if (!document.hidden) heartbeat();
  });
  document.addEventListener('click', (event) => {
    const targetElement = event.target;
    if (!(targetElement instanceof Element)) return;
    const button = targetElement.closest('button');
    if (button instanceof HTMLButtonElement) {
      recordDiagnostic('debug', 'ui', 'button_clicked', {
        control: safeButtonLabel(button)
      });
    }
  }, { capture: true });
}

export function formatDiagnosticReport(nativeLogs = ''): string {
  const environment = typeof navigator !== 'undefined'
    ? { userAgent: redactSensitive(navigator.userAgent), language: navigator.language }
    : {};
  const header = {
    name: 'Whatsmo diagnostic report',
    exportTime: new Date().toISOString(),
    version: '0.1.0',
    session: sessionId,
    entries: entries.length,
    environment
  };
  const safeNative = redactSensitive(nativeLogs).slice(-150000);
  return JSON.stringify(header, null, 2) +
    '\n\n=== JAVASCRIPT EVENTS (JSONL) ===\n' +
    entries.map(item => JSON.stringify(item)).join('\n') +
    '\n\n=== NATIVE LOG TAIL (best-effort redaction) ===\n' +
    (safeNative || 'Native logs unavailable or not requested');
}
