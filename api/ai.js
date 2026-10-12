/**
 * POST /api/ai  { step, payload }  →  { ok, data, usage, mode, promptVersion }
 * GET  /api/ai                     →  { mode, accessRequired, appVersion, promptVersion }
 *
 * Environment (Vercel → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY  required for live AI
 *   AI_MODE            "mock" for test mode (no key, no cost). Defaults to live when a key is set.
 *   ACCESS_CODE        optional. When set, the page must send it (keeps strangers from using credits).
 *   MODEL_FAST / MODEL_SMART  optional model overrides.
 *
 * Privacy: customer text is used only to build the AI request. It is never logged or stored here;
 * logs contain step, model, token counts and cost only.
 */
import { SYSTEM, BUILDERS, stepConfig } from '../lib/prompts.js';
import { SCHEMAS } from '../lib/schemas.js';
import { CLEAN } from '../lib/guardrails.js';
import { callClaude, AIError } from '../lib/claude.js';
import { mockCall } from '../lib/mock.js';
import { costOf } from '../lib/pricing.js';
import { APP_VERSION, PROMPT_VERSION } from '../lib/version.js';
import { accessOk, accessRequired } from '../lib/access.js';

const MAX_BODY = 60_000; // characters

export function aiMode(env = process.env) {
  if (env.AI_MODE === 'mock') return 'mock';
  return env.ANTHROPIC_API_KEY ? 'live' : 'mock';
}

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

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  const mode = aiMode(env);

  if (req.method === 'GET') {
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
  const cfg = stepConfig(step, env);

  try {
    const result = mode === 'mock'
      ? mockCall(step, payload, { system: SYSTEM, messages })
      : await callClaude({ apiKey: env.ANTHROPIC_API_KEY, model: cfg.model, system: SYSTEM, messages, schema: SCHEMAS[step], maxTokens: cfg.maxTokens, fetchImpl });

    const data = CLEAN[step](result.data, payload);
    const pricedModel = mode === 'mock' ? cfg.model : result.model;
    const usage = {
      model: pricedModel,
      input_tokens: result.usage.input_tokens || 0,
      output_tokens: result.usage.output_tokens || 0,
      cost: costOf(pricedModel, result.usage) ?? costOf(cfg.model, result.usage),
      estimated: mode === 'mock',
    };
    console.log(JSON.stringify({ event: 'ai_call', step, mode, model: usage.model, in: usage.input_tokens, out: usage.output_tokens, cost: usage.cost }));
    return send(res, 200, { ok: true, step, data, usage, mode, promptVersion: PROMPT_VERSION });
  } catch (e) {
    const status = e instanceof AIError ? e.status : 500;
    console.log(JSON.stringify({ event: 'ai_error', step, mode, status, message: e.message }));
    return send(res, status, { ok: false, error: e instanceof AIError ? e.message : 'Something went wrong. Try again.', retryable: e.retryable ?? true });
  }
}
