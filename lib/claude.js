/**
 * Minimal Claude Messages API client (no SDK dependency).
 * Uses structured outputs: output_config.format with a JSON schema.
 */
export class AIError extends Error {
  constructor(message, { status = 502, retryable = true } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export async function callClaude({ apiKey, model, system, messages, schema, maxTokens, fetchImpl = fetch, timeoutMs = 60000 }) {
  if (!apiKey) throw new AIError('The AI is not set up yet. Add ANTHROPIC_API_KEY in Vercel.', { status: 500, retryable: false });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { format: { type: 'json_schema', schema } },
      }),
    });
  } catch (e) {
    throw new AIError(e.name === 'AbortError' ? 'The AI took too long to answer. Try again.' : 'Could not reach the AI. Try again.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new AIError(retryable ? 'The AI is busy right now. Wait a moment and try again.' : `The AI request failed (${res.status}).`, { status: retryable ? 503 : 502, retryable });
  }

  const body = await res.json();
  if (body.stop_reason === 'refusal') throw new AIError('The AI could not help with that request. Try rewording your answer.', { status: 422, retryable: false });
  if (body.stop_reason === 'max_tokens') throw new AIError('The answer was cut off. Try again.', { status: 502 });
  const text = (body.content || []).find((b) => b.type === 'text')?.text;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AIError('The AI sent back something unexpected. Try again.');
  }
  return { data, usage: body.usage || {}, model: body.model || model };
}
