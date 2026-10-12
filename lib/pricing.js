/**
 * Claude API pricing used for the proof-of-concept cost meter (USD per million tokens).
 * Source: platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-12).
 * Haiku 5.5 rates are the "up to 100,000 tokens" tier; every request this app makes is far below it.
 * Update here if pricing changes.
 */
export const PRICES = Object.freeze({
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2.00, output: 10.00, cacheWrite: 2.50, cacheRead: 0.10 },
  'claude-opus-5-5': { input: 4.00, output: 20.00, cacheWrite: 5.00, cacheRead: 0.20 },
});

/** Cost of one call in USD. Unknown models return null rather than a guess. */
export function costOf(model, usage = {}) {
  const p = PRICES[model];
  if (!p) return null;
  const m = 1_000_000;
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.output_tokens || 0) * p.output +
      (usage.cache_creation_input_tokens || 0) * p.cacheWrite +
      (usage.cache_read_input_tokens || 0) * p.cacheRead) / m
  );
}
