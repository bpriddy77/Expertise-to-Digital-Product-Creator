/**
 * Minimal Claude API client (no SDK dependency).
 * - Messages with structured outputs: output_config.format with a JSON schema.
 * - Models list, used to pick models this API key can actually use.
 */
const API = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

export class AIError extends Error {
  /**
   * message: safe to show customers.
   * detail:  setup information for the owner (shown only with ?debug=1 and in Vercel logs).
   */
  constructor(message, { status = 502, retryable = true, apiType = null, httpStatus = null, requestId = null, detail = '' } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.apiType = apiType;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
    this.detail = detail;
  }
}

const headers = (apiKey) => ({ 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': VERSION });

const SETUP_PROBLEM = 'The AI isn\'t available right now. Please try again a little later.';

/** Turn an Anthropic error response into a friendly AIError with owner-facing detail. */
export async function errorFrom(res, { model } = {}) {
  let body = {};
  try { body = await res.json(); } catch { /* not JSON */ }
  const apiType = body?.error?.type || null;
  const apiMessage = body?.error?.message || '';
  const requestId = body?.request_id || res.headers?.get?.('request-id') || null;
  const base = { apiType, httpStatus: res.status, requestId };
  const lower = apiMessage.toLowerCase();

  if (res.status === 429 || res.status >= 500 || apiType === 'overloaded_error') {
    if (res.status === 429 && /spend|limit|cap/.test(lower) && !/rate/.test(lower)) {
      return new AIError(SETUP_PROBLEM, { ...base, status: 503, retryable: false, detail: `Spend limit reached: ${apiMessage}. Raise the workspace limit in the Claude Console.` });
    }
    return new AIError('The AI is busy right now. Wait a moment and try again.', { ...base, status: 503, retryable: true, detail: `${res.status} ${apiType}: ${apiMessage}` });
  }
  const detail = {
    authentication_error: 'The API key was rejected. Check ANTHROPIC_API_KEY in Vercel (no extra spaces), then redeploy.',
    billing_error: 'Billing problem on the Claude Console account. Add a payment method or credits.',
    permission_error: 'This API key isn\'t allowed to use that model or workspace. Check the key\'s workspace in the Claude Console.',
    not_found_error: `Model "${model}" isn't available to this API key.`,
  }[apiType] || (res.status === 400 && /spend|limit/.test(lower)
    ? 'Spend limit reached. Raise the workspace or organization limit in the Claude Console.'
    : `${res.status} ${apiType || ''}`.trim());
  return new AIError(SETUP_PROBLEM, { ...base, status: res.status === 400 ? 502 : 503, retryable: false, detail: `${detail}${apiMessage ? ` (Anthropic: ${apiMessage})` : ''}` });
}

export async function callClaude({ apiKey, model, system, messages, schema, maxTokens, fetchImpl = fetch, timeoutMs = 60000 }) {
  if (!apiKey) throw new AIError(SETUP_PROBLEM, { status: 500, retryable: false, detail: 'ANTHROPIC_API_KEY is not set in Vercel.' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${API}/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: headers(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { format: { type: 'json_schema', schema } },
      }),
    });
  } catch (e) {
    throw new AIError(e.name === 'AbortError' ? 'The AI took too long to answer. Try again.' : 'Could not reach the AI. Try again.', { detail: e.message });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw await errorFrom(res, { model });

  const body = await res.json();
  if (body.stop_reason === 'refusal') throw new AIError('The AI could not help with that request. Try rewording your answer.', { status: 422, retryable: false });
  if (body.stop_reason === 'max_tokens') throw new AIError('The answer was cut off. Try again.', { status: 502, detail: `max_tokens reached on ${model}` });
  const text = (body.content || []).find((b) => b.type === 'text')?.text;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AIError('The AI sent back something unexpected. Try again.', { detail: 'Response was not valid JSON.' });
  }
  return { data, usage: body.usage || {}, model: body.model || model };
}

/** All models this key can use (newest first), following pagination. */
export async function listModels({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new AIError(SETUP_PROBLEM, { status: 500, retryable: false, detail: 'ANTHROPIC_API_KEY is not set in Vercel.' });
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const url = `${API}/models?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ''}`;
    let res;
    try {
      res = await fetchImpl(url, { headers: headers(apiKey) });
    } catch (e) {
      throw new AIError('Could not reach the AI. Try again.', { detail: e.message });
    }
    if (!res.ok) throw await errorFrom(res);
    const body = await res.json();
    out.push(...(body.data || []));
    if (!body.has_more || !body.last_id) break;
    after = body.last_id;
  }
  return out;
}
