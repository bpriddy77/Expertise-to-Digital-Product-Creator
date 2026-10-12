/**
 * Claude API pricing for the cost meter (USD per million tokens, standard rates).
 * Source: platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-12).
 * Haiku 5.5 uses its "up to 100,000 tokens" tier; every request this app makes is far below it.
 * Dated snapshots (…-20251001) are priced as their base model. Unknown models return null.
 */
const P = (input, output, readMult = 0.1) => ({ input, output, cacheWrite: input * 1.25, cacheRead: input * readMult });

export const PRICES = Object.freeze({
  'claude-haiku-5-5': P(0.10, 0.50),
  'claude-sonnet-5-5': P(2, 10, 0.05),
  'claude-opus-5-5': P(4, 20, 0.05),
  'claude-sonnet-5': P(2, 10),
  'claude-opus-5': P(5, 25),
  'claude-sonnet-4-6': P(3, 15),
  'claude-sonnet-4-5': P(3, 15),
  'claude-haiku-4-5': P(1, 5),
  'claude-opus-4-8': P(5, 25),
  'claude-opus-4-7': P(5, 25),
  'claude-opus-4-6': P(5, 25),
  'claude-opus-4-5': P(5, 25),
});

export function priceFor(model) {
  const id = String(model || '');
  return PRICES[id] || PRICES[id.replace(/-\d{8}$/, '')] || null;
}

/** Cost of one call in USD. Unknown models return null rather than a guess. */
export function costOf(model, usage = {}) {
  const p = priceFor(model);
  if (!p) return null;
  const m = 1_000_000;
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.output_tokens || 0) * p.output +
      (usage.cache_creation_input_tokens || 0) * p.cacheWrite +
      (usage.cache_read_input_tokens || 0) * p.cacheRead) / m
  );
}
