/**
 * Deterministic rules shared by the page and the server. No AI here.
 */

/* ---------- Limits (cost control at a $7 price) ---------- */
export const LIMITS = Object.freeze({
  followups: 5, // at most one per question
  strengths: 3, // first suggestions + 2 retries
  ideas: 3,
  outline: 2,
  sections: 10, // first draft of each section (intro + up to 6 exercises + outcome)
  regenerations: 8, // section rewrites
  summary: 2,
  answerChars: 3000, // per answer sent to the AI
  instructionChars: 400, // per regenerate instruction
});

/* ---------- Market validation: evidence level ----------
 * Never labels a product "validated" or "profitable". Each level needs real entries.
 */
export const EVIDENCE_LEVELS = Object.freeze([
  { key: 'none', label: 'Not checked yet', detail: 'Add what you find below. You can still build your first version to test.' },
  { key: 'comparables', label: 'Similar products found', detail: 'Others sell something similar, which suggests people look for help with this.' },
  { key: 'questions', label: 'Customer questions found', detail: 'You found real questions people ask about this problem.' },
  { key: 'interest', label: 'Interest shown', detail: 'Real people asked for help or joined a list. This is early demand.' },
  { key: 'paid', label: 'Willingness to pay shown', detail: 'People have paid you for this help, or pre-ordered. This is the strongest early signal.' },
]);

const filled = (s) => typeof s === 'string' && s.trim() !== '';
const n = (v) => {
  const x = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

export function evidenceLevel(v = {}) {
  const comps = (v.comparables || []).filter((c) => filled(c?.name));
  const questions = (v.questions || []).filter(filled);
  const signals = v.signals || {};
  if (n(signals.presales) > 0 || n(signals.paidClients) > 0) return EVIDENCE_LEVELS[4];
  if (n(signals.askedForHelp) > 0 || n(signals.waitlist) > 0) return EVIDENCE_LEVELS[3];
  if (questions.length >= 1) return EVIDENCE_LEVELS[2];
  if (comps.length >= 1) return EVIDENCE_LEVELS[1];
  return EVIDENCE_LEVELS[0];
}

/* ---------- Suggested starting price ----------
 * From the customer's own comparable prices: just under the median, ending in 7.
 * Without comparables, a low price to test demand, clearly labeled as such.
 */
export const DEFAULT_TEST_PRICE = 17;

export function suggestPrice(comparables = []) {
  const prices = comparables.map((c) => n(c?.price)).filter((p) => p > 0).sort((a, b) => a - b);
  if (prices.length === 0) {
    return {
      price: DEFAULT_TEST_PRICE,
      basis: 'none',
      note: 'A low starting price to test demand. Add the prices of 2 or 3 similar products to tailor it.',
    };
  }
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  const price = endInSeven(median * 0.9);
  return {
    price,
    basis: 'comparables',
    median,
    count: prices.length,
    note: `Just under the middle price of the ${prices.length} similar product${prices.length > 1 ? 's' : ''} you found (${fmt(median)}). Test it, then adjust.`,
  };
}

function endInSeven(x) {
  if (x < 7) return Math.max(1, Math.round(x));
  const tens = Math.floor(x / 10) * 10;
  const candidate = tens + 7;
  return candidate <= x + 0.0001 ? candidate : Math.max(7, tens - 3);
}

const fmt = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

/* ---------- Income-claim wording (FTC) ---------- */
const RISKY = [
  { re: /passive income/i, label: '"passive income"' },
  { re: /guarantee/i, label: 'guarantees' },
  { re: /make money while you sleep/i, label: '"make money while you sleep"' },
  { re: /\$\s?\d[\d,]*k?\s*(a|per|\/)\s*(month|mo|year|yr|week|day)/i, label: 'dollar amounts per month or year' },
  { re: /six[- ]figure|seven[- ]figure/i, label: '"six-figure" style claims' },
  { re: /get rich/i, label: '"get rich"' },
];
export function riskyPhrases(text) {
  return RISKY.filter((r) => r.re.test(String(text || ''))).map((r) => r.label);
}
