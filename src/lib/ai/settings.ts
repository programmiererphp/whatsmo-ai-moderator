import { writable } from 'svelte/store';
import { recordDiagnostic } from '$lib/diagnostics/logger';

export interface AiSettings {
  apiKey: string;
  textModel: string;
  imageModel: string;
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutSeconds: number;
  perCallUsd: number;
  sessionUsd: number;
  imageCallUsd: number;
  textFeatureUsd: number;
  imageFeatureUsd: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  allowUnknownPrice: boolean;
  instruction: string;
}
export const DEFAULT_INSTRUCTION = [
  'You are a helpful conversational writing coach. Focus on authentic, concise, relaxed messages.',
  'Consider reciprocity and avoid overloading the recipient with too many questions or invitations.',
  'Prefer subtle wit and natural human wording over artificial or exaggerated flirting.',
  "Never invent the other person's feelings. Mention uncertainty when assessing interest.",
  'Return ONLY JSON: {"decision":"send|rewrite|hold","hint":"brief explanation",',
  '"rewrite":"improved message or original","delayMinutes":0}.',
  'Use hold only when there is a sensible reason. Never send automatically.'
].join(' ');
const STORAGE_KEY = 'whatsmo.ai.settings.v1';
const initial: AiSettings = {
  apiKey: '', textModel: 'google/gemini-2.5-flash-lite',
  imageModel: 'google/gemini-2.5-flash-image',
  maxInputChars: 4000, maxOutputTokens: 350, timeoutSeconds: 35,
  perCallUsd: 0.02, sessionUsd: 1, imageCallUsd: 0.15,
  textFeatureUsd: 0.5, imageFeatureUsd: 0.5,
  inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.40,
  allowUnknownPrice: false,
  instruction: DEFAULT_INSTRUCTION
};
export function getAiSettings(): AiSettings {
  try {
    const value = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') : {};
    if (typeof value !== 'object' || value === null) return { ...initial };
    const merged = { ...initial, ...value };
    for (const [key, fallback] of Object.entries(initial)) {
      if (typeof (merged as unknown as Record<string, unknown>)[key] !== typeof fallback)
        (merged as unknown as Record<string, unknown>)[key] = fallback;
    }
    return merged;
  } catch { return { ...initial }; }
}
export const aiSettings = writable<AiSettings>(getAiSettings());
export function updateAiSettings(patch: Partial<AiSettings>): void {
  aiSettings.update(current => {
    const next = { ...current, ...patch };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { /* unavailable or full */ }
    recordDiagnostic('info', 'ai', 'settings_updated'); // Never log key or prompt.
    return next;
  });
}
export function hasAiKey(settings: AiSettings): boolean {
  return settings.apiKey.startsWith('sk-') && settings.apiKey.length >= 15;
}
