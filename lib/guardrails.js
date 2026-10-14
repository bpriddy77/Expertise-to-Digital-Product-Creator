/**
 * Checks applied to every AI response before the customer sees it.
 * - Evidence marked as a fact must quote the customer's own words; otherwise it becomes an assumption.
 * - Funnel prices are kept inside the published range for each position.
 * - Income-claim wording is removed (FTC).
 * - The result must pass validateMap(), the same check the map uses for saved data.
 */
import { QUESTIONS } from '../public/shared/interview.js';
import { validateMap, MAP_SCHEMA, SLOTS, PRICE_RANGES, priceValue } from '../public/shared/map-model.js';
import { PROMPT_VERSION } from '../public/shared/version.js';
import { AIError } from './claude.js';

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[‘’`´]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^a-z0-9'"$%]+/g, ' ')
  .trim();

function allAnswerText(answers = {}) {
  return QUESTIONS.map((q) => {
    const a = answers[q.id] || {};
    return norm(`${a.answer || ''} ${a.followUpAnswer || ''}`);
  }).join(' | ');
}

/** True when the quote (at least three words) appears in the customer's answers. */
export function quoteIsGenuine(quote, answers) {
  const q = norm(quote);
  if (q.split(' ').filter(Boolean).length < 3) return false;
  return allAnswerText(answers).includes(q);
}

const RISKY = [
  /passive income/i, /guarantee/i, /money while you sleep/i, /six[- ]figure|seven[- ]figure/i, /get rich/i,
  /\b(make|earn|bring in|generate|net)\s+(about\s+|around\s+|up to\s+|over\s+)?\$\s?\d/i,
  /\$\s?\d[\d,]*k?\s*(a|per|\/)\s*(month|year|week|day)\s+(in|of)\s+(income|revenue|profit|sales)/i,
];
export const hasIncomeClaim = (text) => RISKY.some((re) => re.test(String(text || '')));

/** Remove any sentence that reads like an income claim. */
export function stripIncomeClaims(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => !hasIncomeClaim(s)).join(' ').trim();
}

/** Keep a suggested funnel price inside the published range for its position. */
export function priceInRange(slot, price) {
  if (!slot) return '';
  const r = PRICE_RANGES[slot];
  const n = priceValue(price);
  if (!n) return SLOTS[slot].example;
  const clamped = Math.min(r.high, Math.max(r.low, Math.round(n)));
  return `$${clamped}`;
}

const s = (v, max = 600) => String(v ?? '').trim().slice(0, max);

export const NEXT_STEP = 'When you are ready to build, Priddy Impact Group can create your funnel pages, workflows and emails in HighLevel, or you can build the products yourself with the $47 Low-Ticket Authority Funnel course.';

export const CLEAN = {
  followup(d) {
    const needs = Boolean(d.needs_follow_up) && s(d.follow_up_question).length > 0;
    const list = (v) => (v || []).map((x) => stripIncomeClaims(s(x, 200))).filter(Boolean).slice(0, 3);
    return {
      acknowledgement: stripIncomeClaims(s(d.acknowledgement, 300)),
      needs_follow_up: needs,
      follow_up_question: needs ? s(d.follow_up_question, 300) : '',
      follow_up_examples: needs ? list(d.follow_up_examples) : [],
      next_examples: list(d.next_examples),
    };
  },

  map(d, payload = {}) {
    const answers = payload.answers || {};
    let downgraded = 0;
    const opportunities = (d.opportunities || []).map((o) => ({
      id: s(o.id, 20), name: s(o.name, 90), stage: o.stage, format: s(o.format, 160),
      buyer: s(o.buyer), problem: s(o.problem), outcome: stripIncomeClaims(s(o.outcome)),
      role: o.slot ? 'paid' : o.role, roleReason: stripIncomeClaims(s(o.roleReason)),
      slot: o.slot || '', price: priceInRange(o.slot, o.price),
      sources: { assets: o.source_assets || [], problems: o.source_problems || [] },
      connects: o.connects || [],
      evidence: (o.evidence || []).map((e) => {
        if (e.type === 'fact' && !quoteIsGenuine(e.quote, answers)) {
          downgraded++;
          return { type: 'assumption', text: s(e.text) };
        }
        return { type: e.type, text: s(e.text) };
      }),
      effort: s(o.effort, 160),
      removed: false,
    }));
    const r = d.recommendation || {};
    const input = {
      schema: MAP_SCHEMA,
      business: { ...(d.business || {}), exampleLabel: '' },
      offers: d.offers || [],
      process: d.process || {},
      assets: d.assets || [],
      problems: d.problems || [],
      opportunities,
      recommendation: {
        opportunityId: r.opportunityId,
        why: (r.why || []).map((x) => stripIncomeClaims(x)).filter(Boolean),
        assumptions: r.assumptions || [],
        validationStep: stripIncomeClaims(r.validationStep),
        nextStep: NEXT_STEP,
      },
      summary: stripIncomeClaims(d.summary),
      goal: payload.goal,
      meta: { createdAt: new Date().toISOString(), source: 'ai', promptVersion: PROMPT_VERSION },
    };
    const v = validateMap(input);
    if (!v.ok) {
      throw new AIError('The map came back incomplete. Try again.', { status: 502, retryable: true, detail: `Map failed validation: ${v.errors.join(' ')}` });
    }
    return { map: v.map, warnings: v.warnings, downgradedFacts: downgraded, missingInfo: s(d.missing_info, 300) };
  },
};
