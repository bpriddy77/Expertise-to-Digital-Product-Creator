/**
 * POST /api/ai  { step, payload }  →  { ok, data, usage, mode, promptVersion }
 * POST /api/ai  { step: "verify" } →  checks the access code only (no AI call)
 * GET  /api/ai                     →  { mode, accessRequired, appVersion, promptVersion }
 * GET  /api/ai?check=1&code=…      →  setup check for the owner: is the key working, which models are used
 *
 * Environment (Vercel → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY  required for live AI (secret)
 *   ACCESS_CODE        optional (secret). When set, the page must send it.
 *   AI_MODE            "mock" forces test mode.
 *   MODEL_FAST / MODEL_SMART  optional overrides; otherwise models are picked from what the key can use.
 *
 * Privacy: customer text is used only to build the AI request. It is never logged or stored here;
 * logs contain step, model, token counts, cost and error codes only.
 */
import { SYSTEM, BUILDERS, stepConfig, ESTIMATE_MODELS } from '../lib/prompts.js';
import { SCHEMAS } from '../lib/schemas.js';
import { CLEAN } from '../lib/guardrails.js';
import { callClaude, AIError } from '../lib/claude.js';
import { resolveModels, markUnavailable } from '../lib/models.js';
import { mockCall } from '../lib/mock.js';
import { costOf } from '../lib/pricing.js';
import { APP_VERSION, PROMPT_VERSION } from '../lib/version.js';
import { accessOk, accessRequired } from '../lib/access.js';

const MAX_BODY = 60_000; // characters

export function aiMode(env = process.env) {
  if (env.AI_MODE === 'mock') return 'mock';
  return String(env.ANTHROPIC_API_KEY ?? '').trim() ? 'live' : 'mock';
}
const keyOf = (env) => String(env.ANTHROPIC_API_KEY ?? '').trim();

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new AIError('That is too much text to send at once.', { status: 413, retryable: false });
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}

/** Call Claude with the right model for the role; if a model turns out to be unavailable, pick again once. */
async function callWithModels({ role, env, fetchImpl, ...args }) {
  const apiKey = keyOf(env);
  for (let attempt = 0; attempt < 2; attempt++) {
    const models = await resolveModels({ apiKey, env, fetchImpl });
    const model = models[role];
    try {
      return await callClaude({ apiKey, model, fetchImpl, ...args });
    } catch (e) {
      if (attempt === 0 && e instanceof AIError && e.apiType === 'not_found_error') {
        console.log(JSON.stringify({ event: 'model_unavailable', model, requestId: e.requestId }));
        markUnavailable(model);
        continue;
      }
      throw e;
    }
  }
  throw new AIError('The AI isn\'t available right now. Please try again a little later.', { status: 503, retryable: false, detail: 'No working model after retry.' });
}

/** Owner setup check: lists models, makes one tiny call per role. Costs a fraction of a cent. */
async function setupCheck(env, fetchImpl) {
  const out = { appVersion: APP_VERSION, mode: aiMode(env), accessCodeSet: accessRequired(env), keySet: Boolean(keyOf(env)) };
  if (out.mode !== 'live') return { ...out, ok: true, note: 'Test mode: no API key in use, so there is nothing to check.' };
  try {
    const models = await resolveModels({ apiKey: keyOf(env), env, fetchImpl });
    Object.assign(out, { modelsAvailable: models.available.length, fast: models.fast, smart: models.smart });
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    for (const role of ['fast', 'smart']) {
      const r = await callClaude({ apiKey: keyOf(env), model: models[role], system: 'Reply with JSON.', messages: [{ role: 'user', content: 'Say ok.' }], schema, maxTokens: 50, fetchImpl });
      out[`${role}Test`] = r.data?.ok === true ? 'working' : 'unexpected reply';
    }
    return { ...out, ok: true };
  } catch (e) {
    return { ...out, ok: false, problem: e.detail || e.message, requestId: e.requestId || undefined };
  }
}

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  const mode = aiMode(env);

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://x');
    if (url.searchParams.has('check')) {
      const fake = { headers: { 'x-access-code': url.searchParams.get('code') || '' } };
      if (!accessOk(fake, env)) return send(res, 401, { ok: false, error: 'Add &code=YOUR_ACCESS_CODE to the address.' });
      return send(res, 200, await setupCheck(env, fetchImpl));
    }
    return send(res, 200, { mode, accessRequired: accessRequired(env), appVersion: APP_VERSION, promptVersion: PROMPT_VERSION });
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });

  if (!accessOk(req, env)) {
    return send(res, 401, { ok: false, error: 'That access code doesn\'t match. Check your purchase email and try again.', code: 'access' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return send(res, e.status || 400, { ok: false, error: e.status ? e.message : 'The request could not be read.' });
  }
  if (JSON.stringify(body).length > MAX_BODY) return send(res, 413, { ok: false, error: 'That is too much text to send at once.' });

  const { step, payload = {} } = body;
  // "verify" only checks the access code (above). No AI call, no cost.
  if (step === 'verify') return send(res, 200, { ok: true, mode });
  if (!BUILDERS[step]) return send(res, 400, { ok: false, error: 'Unknown step.' });

  let messages;
  try {
    messages = BUILDERS[step](payload);
  } catch (e) {
    return send(res, 400, { ok: false, error: e.message });
  }
  const cfg = stepConfig(step);

  try {
    const result = mode === 'mock'
      ? { ...mockCall(step, payload, { system: SYSTEM, messages }), model: ESTIMATE_MODELS[cfg.role] }
      : await callWithModels({ role: cfg.role, env, fetchImpl, system: SYSTEM, messages, schema: SCHEMAS[step], maxTokens: cfg.maxTokens });

    const data = CLEAN[step](result.data, payload);
    const usage = {
      model: result.model,
      input_tokens: result.usage.input_tokens || 0,
      output_tokens: result.usage.output_tokens || 0,
      cost: costOf(result.model, result.usage),
      estimated: mode === 'mock',
    };
    console.log(JSON.stringify({ event: 'ai_call', step, mode, model: usage.model, in: usage.input_tokens, out: usage.output_tokens, cost: usage.cost }));
    return send(res, 200, { ok: true, step, data, usage, mode, promptVersion: PROMPT_VERSION });
  } catch (e) {
    const known = e instanceof AIError;
    const status = known ? e.status : 500;
    console.log(JSON.stringify({ event: 'ai_error', step, mode, status, apiType: e.apiType, httpStatus: e.httpStatus, requestId: e.requestId, detail: e.detail || e.message }));
    return send(res, status, {
      ok: false,
      error: known ? e.message : 'Something went wrong. Try again.',
      retryable: e.retryable ?? true,
      detail: known ? e.detail || undefined : undefined, // shown on the page only with ?debug=1
    });
  }
}
