/**
 * Picks the models to use from the ones this API key can actually call.
 *
 * Two roles:
 *   fast  — the quick "is this answer specific enough?" check (cheap, Haiku line)
 *   smart — everything the customer reads (Sonnet line)
 *
 * Order of preference: MODEL_FAST / MODEL_SMART if set and available, then the
 * preferred list below, then the newest available model in the right line.
 * The list is cached per server instance for 10 minutes.
 */
import { listModels, AIError } from './claude.js';

export const PREFERRED = Object.freeze({
  fast: ['claude-haiku-5-5', 'claude-haiku-4-5'],
  smart: ['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5'],
});
const LINE = { fast: 'haiku', smart: 'sonnet' };
const TTL = 10 * 60 * 1000;

let cache = { at: 0, key: '', models: null };
const bad = new Set(); // models that returned "not found" on this instance

export function resetModelCache() {
  cache = { at: 0, key: '', models: null };
  bad.clear();
}
export function markUnavailable(id) {
  bad.add(id);
}

const usable = (m) => m && m.lifecycle !== 'retired' && !bad.has(m.id)
  && !(m.capabilities && 'structured_outputs' in m.capabilities && !m.capabilities.structured_outputs);

/** Find a model in the list by exact id, or a dated snapshot of an alias (claude-haiku-4-5 → claude-haiku-4-5-20251001). */
function find(list, wanted) {
  if (!wanted) return null;
  return list.find((m) => m.id === wanted) || list.find((m) => m.id.startsWith(`${wanted}-`) && /-\d{8}$/.test(m.id)) || null;
}

const lineOf = (m) => m.line || (/haiku/.test(m.id) ? 'haiku' : /sonnet/.test(m.id) ? 'sonnet' : /opus/.test(m.id) ? 'opus' : null);

export function pickModel(role, models, override) {
  const list = (models || []).filter(usable);
  for (const want of [override, ...PREFERRED[role]]) {
    const m = find(list, want);
    if (m) return m.id;
  }
  const active = list.filter((m) => m.lifecycle !== 'deprecated');
  const inLine = (arr) => arr.filter((m) => lineOf(m) === LINE[role]);
  const newest = (arr) => [...arr].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  return (newest(inLine(active)) || newest(inLine(list)))?.id || null;
}

export async function resolveModels({ apiKey, env = process.env, fetchImpl }) {
  if (!cache.models || cache.key !== apiKey || Date.now() - cache.at > TTL) {
    cache = { at: Date.now(), key: apiKey, models: await listModels({ apiKey, fetchImpl }) };
  }
  const smart = pickModel('smart', cache.models, env.MODEL_SMART);
  const fast = pickModel('fast', cache.models, env.MODEL_FAST) || smart;
  if (!smart) {
    throw new AIError('The AI isn\'t available right now. Please try again a little later.', {
      status: 503, retryable: false,
      detail: `No suitable Claude model is available to this API key. Available: ${cache.models.map((m) => m.id).join(', ') || 'none'}.`,
    });
  }
  return { fast, smart, available: cache.models.map((m) => m.id) };
}
