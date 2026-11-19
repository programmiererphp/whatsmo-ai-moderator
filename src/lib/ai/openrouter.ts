import { get } from 'svelte/store';
import { aiSettings, hasAiKey } from './settings';
import { recordDiagnostic, recordDiagnosticError } from '$lib/diagnostics/logger';

interface Usage {
  prompt_tokens?: number; completion_tokens?: number; cost?: number;
}
export type AiFeature = 'text' | 'image';
export interface AiResult { text?: string; image?: string; costUsd: number; estimated: boolean; }
const URL = 'https://openrouter.ai/api/v1/';
const COST_KEY = 'whatsmo.ai.cost.v1';
interface Spending { total: number; text: number; image: number; }
function readSpend(): Spending {
  try {
    const data = JSON.parse(sessionStorage.getItem(COST_KEY) || '{}');
    return { total: Number(data.total) || 0, text: Number(data.text) || 0, image: Number(data.image) || 0 };
  } catch { return { total: 0, text: 0, image: 0 }; }
}
export function spent(): Spending { return readSpend(); }
function saveSpend(feature: AiFeature, amount: number): void {
  try {
    const s = readSpend();
    s.total += amount;
    s[feature] += amount;
    sessionStorage.setItem(COST_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}
function assertBudget(feature: AiFeature, estimated: number): void {
  const cfg = get(aiSettings);
  const s = readSpend();
  const perCall = feature === 'text' ? cfg.perCallUsd : cfg.imageCallUsd;
  const featureCap = feature === 'text' ? cfg.textFeatureUsd : cfg.imageFeatureUsd;
  if (estimated > perCall || s.total + estimated > cfg.sessionUsd || s[feature] + estimated > featureCap)
    throw new Error('AI budget cap reached. Adjust caps in Settings > AI Coach.');
}
function textUpperBound(chars: number): number {
  const cfg = get(aiSettings);
  // A conservative estimate, not an exact token count or guaranteed provider price.
  return Math.ceil(chars / 2) * cfg.inputUsdPerMillion / 1e6 +
    cfg.maxOutputTokens * cfg.outputUsdPerMillion / 1e6;
}
async function request(endpoint: string, payload: Record<string, unknown>, feature: AiFeature, estimate: number): Promise<Record<string, unknown>> {
  const cfg = get(aiSettings);
  if (!hasAiKey(cfg)) throw new Error('Configure your OpenRouter API key in Settings > AI Coach.');
  if (feature === 'text' && cfg.textModel !== 'google/gemini-2.5-flash-lite' && !cfg.allowUnknownPrice)
    throw new Error('For custom models, confirm pricing and enable Allow custom model prices in Settings.');
  assertBudget(feature, estimate);
  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), cfg.timeoutSeconds * 1000);
  const started = Date.now();
  recordDiagnostic('info', 'ai', feature + '_request_started', { model: feature === 'text' ? cfg.textModel : cfg.imageModel });
  try {
    const response = await fetch(URL + endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/programmiererphp/whatsmo-ai-moderator',
        'X-Title': 'Whatsmo AI Moderator'
      },
      body: JSON.stringify(payload),
      signal: abort.signal
    });
    if (!response.ok) throw new Error('OpenRouter HTTP ' + response.status);
    const json = (await response.json()) as Record<string, unknown>;
    const usage = json.usage as Usage | undefined;
    const cost = typeof usage?.cost === 'number' && usage.cost >= 0 ? usage.cost : estimate;
    saveSpend(feature, cost);
    recordDiagnostic('info', 'ai', feature + '_request_succeeded', {
      elapsedMs: Date.now() - started, costUsd: cost, estimated: usage?.cost === undefined
    });
    return json;
  } catch (error) {
    recordDiagnosticError('ai', feature + '_request_failed', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
export async function generateText(system: string, user: string): Promise<AiResult> {
  const cfg = get(aiSettings);
  const limited = user.slice(0, cfg.maxInputChars);
  const estimate = textUpperBound(system.length + limited.length);
  const json = await request('chat/completions', {
    model: cfg.textModel,
    messages: [{ role: 'system', content: system }, { role: 'user', content: limited }],
    max_tokens: cfg.maxOutputTokens,
    temperature: 0.7
  }, 'text', estimate);
  const choices = json.choices as Array<{message?: {content?: string}}> | undefined;
  const text = choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('AI returned no text.');
  return { text, costUsd: (json.usage as Usage | undefined)?.cost ?? estimate, estimated: !((json.usage as Usage | undefined)?.cost !== undefined) };
}
export async function generateImage(prompt: string): Promise<AiResult> {
  const cfg = get(aiSettings);
  // Image models have unpredictable provider pricing: user supplies an estimate/cap.
  const estimate = cfg.imageCallUsd;
  const json = await request('images', {
    model: cfg.imageModel, prompt: prompt.slice(0, cfg.maxInputChars),
    n: 1, aspect_ratio: '1:1', output_format: 'png'
  }, 'image', estimate);
  const data = json.data as Array<{b64_json?: string; url?: string; media_type?: string}> | undefined;
  const first = data?.[0];
  const image = first?.b64_json
    ? 'data:' + (first.media_type || 'image/png') + ';base64,' + first.b64_json
    : (first?.url?.startsWith('https://') ? first.url : undefined);
  if (!image) throw new Error('Image API returned no supported image.');
  return { image, costUsd: (json.usage as Usage | undefined)?.cost ?? estimate, estimated: (json.usage as Usage | undefined)?.cost === undefined };
}
