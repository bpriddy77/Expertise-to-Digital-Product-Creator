/**
 * POST /api/ai  { step: "followup" | "map", payload }   header x-map-token: buyer's link token
 *   →  { ok, data, usage, mode, promptVersion }
 * GET  /api/ai  →  { mode, appVersion, promptVersion }
 *
 * Limits per buyer (environment, optional): AI_CALL_LIMIT (default 120), MAP_LIMIT (default 8).
 * Privacy: customer text is used only to build the AI request; logs hold step, model, tokens and cost only.
 */
import { SYSTEM, BUILDERS, stepConfig, ESTIMATE_MODELS } from '../lib/prompts.js';
import { SCHEMAS } from '../lib/schemas.js';
import { CLEAN } from '../lib/guardrails.js';
import { callClaude, AIError } from '../lib/claude.js';
import { resolveModels, markUnavailable } from '../lib/models.js';
import { mockCall } from '../lib/mock.js';
import { costOf } from '../lib/pricing.js';
import { APP_VERSION, PROMPT_VERSION } from '../lib/version.js';
import { readBody, send, tokenFrom, log, fail, HttpError } from '../lib/http.js';
import { buyerFor } from '../lib/session.js';
import { AOV_GOALS } from '../public/shared/map-model.js';

export function aiMode(env = process.env) {
  if (env.AI_MODE === 'mock') return 'mock';
  return String(env.ANTHROPIC_API_KEY ?? '').trim() ? 'live' : 'mock';
}
const keyOf = (env) => String(env.ANTHROPIC_API_KEY ?? '').trim();
const limit = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);

/** Call Claude with the right model for the role; if a model turns out to be unavailable, pick again once. */
export async function callWithModels({ role, env, fetchImpl, ...args }) {
  const apiKey = keyOf(env);
  for (let attempt = 0; attempt < 2; attempt++) {
    const models = await resolveModels({ apiKey, env, fetchImpl });
    const model = models[role];
    try {
      return await callClaude({ apiKey, model, fetchImpl, ...args });
    } catch (e) {
      if (attempt === 0 && e instanceof AIError && e.apiType === 'not_found_error') {
        log('model_unavailable', { model, requestId: e.requestId });
        markUnavailable(model);
        continue;
      }
      throw e;
    }
  }
  throw new AIError('The AI isn\'t available right now. Please try again a little later.', { status: 503, retryable: false, detail: 'No working model after retry.' });
}

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  const mode = aiMode(env);
  if (req.method === 'GET') return send(res, 200, { mode, appVersion: APP_VERSION, promptVersion: PROMPT_VERSION });
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });

  let step;
  try {
    const { buyer, store } = await buyerFor(tokenFrom(req), { env, fetchImpl });
    const body = await readBody(req);
    step = body.step;
    const payload = body.payload || {};
    if (!BUILDERS[step]) throw new HttpError(400, 'Unknown step.');
    payload.goal = AOV_GOALS.includes(Number(payload.goal)) ? Number(payload.goal) : 100;

    const callCap = limit(env.AI_CALL_LIMIT, 120);
    const mapCap = limit(env.MAP_LIMIT, 8);
    if ((buyer.ai_calls || 0) >= callCap || (step === 'map' && (buyer.map_generations || 0) >= mapCap)) {
      throw new HttpError(429, step === 'map'
        ? 'You have reached the number of fresh maps included with your purchase. You can still edit your current map, or contact us for help.'
        : 'You have reached the AI help included with your purchase. You can keep answering, and edit your map directly.');
    }

    const messages = BUILDERS[step](payload);
    const cfg = stepConfig(step);
    const result = mode === 'mock'
      ? { ...mockCall(step, payload), model: ESTIMATE_MODELS[cfg.role] }
      : await callWithModels({ role: cfg.role, env, fetchImpl, system: SYSTEM, messages, schema: SCHEMAS[step], maxTokens: cfg.maxTokens, timeoutMs: cfg.timeoutMs });
    const data = CLEAN[step](result.data, payload);

    await store.updateBuyer(buyer.id, {
      ai_calls: (buyer.ai_calls || 0) + 1,
      ...(step === 'map' ? { map_generations: (buyer.map_generations || 0) + 1 } : {}),
      last_seen_at: new Date().toISOString(),
    });

    const usage = {
      model: result.model,
      input_tokens: result.usage.input_tokens || 0,
      output_tokens: result.usage.output_tokens || 0,
      cost: costOf(result.model, result.usage),
      estimated: mode === 'mock',
    };
    log('ai_call', { step, mode, model: usage.model, in: usage.input_tokens, out: usage.output_tokens, cost: usage.cost, downgraded: data.downgradedFacts });
    return send(res, 200, { ok: true, step, data, usage, mode, promptVersion: PROMPT_VERSION });
  } catch (e) {
    return fail(res, e, `ai_error:${step || 'unknown'}`);
  }
}
