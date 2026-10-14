/**
 * Digital Product Opportunity Map — data model (schema "opportunity-map/1").
 *
 * This is the contract between the AI-guided discovery and the visual map:
 * the AI must produce this shape, validateMap() checks it before anything renders,
 * and the customer's edits are saved in the same shape.
 *
 * Key distinctions the brief requires:
 *   assets        what the business ALREADY HAS (customer-stated)
 *   problems      recurring client needs and friction (customer-stated)
 *   opportunities SUGGESTED products (AI hypotheses until the customer confirms)
 *   evidence      each item is a "fact" (the customer said it) or an "assumption" (not yet known)
 *   role          paid product, free resource, onboarding tool, or included in the service
 */

export const MAP_SCHEMA = 'opportunity-map/2';

/** The five checkout positions of an Authority Funnel. None is required except that a funnel starts with a main product. */
export const SLOTS = Object.freeze({
  main: { label: 'Main product', when: 'What they buy first, often from an ad', priceHint: 'Usually $0 to $50; often $7 to $29', example: '$27' },
  bump: { label: 'Order bump', when: 'A small add-on they tick at checkout', priceHint: 'A small add-on price', example: '$17' },
  upsell: { label: 'Upsell', when: 'Offered right after they buy, in one click', priceHint: 'A bigger next step', example: '$97' },
  downsell: { label: 'Downsell', when: 'Shown only if they say no to the upsell', priceHint: 'A lighter, lower-priced version of the upsell', example: '$47' },
  oto: { label: 'One-time offer', when: 'A final offer before they leave the checkout', priceHint: 'The biggest step before your signature offer', example: '$297' },
});
export const SLOT_ORDER = Object.freeze(['main', 'bump', 'upsell', 'downsell', 'oto']);

export const STAGES = Object.freeze([
  { id: 'before', label: 'Before they buy', hint: 'Finding you, asking questions, deciding' },
  { id: 'prepare', label: 'Getting started', hint: 'Onboarding, setup or the first order' },
  { id: 'deliver', label: 'Getting the result', hint: 'Your service, program or product in use' },
  { id: 'after', label: 'After the result', hint: 'Follow-up, care and what comes next' },
]);

export const ROLES = Object.freeze({
  paid: { label: 'Digital product', help: 'Useful on its own. Sell it in your Authority Funnel, in your store, or both.' },
  free: { label: 'Lead magnet', help: 'Give it away to attract the right people. A candidate for your high-value lead magnet.' },
  onboarding: { label: 'Onboarding tool', help: 'Give it to new signature-offer customers so they start prepared.' },
  included: { label: 'Keep inside your offer', help: 'Part of what signature-offer customers already get. Saves repeat explanations.' },
});

export const RELATIONS = Object.freeze({
  prepares: { label: 'Prepares buyers for', short: 'prepares for' },
  supports: { label: 'Supports customers during', short: 'supports' },
  leads: { label: 'Can lead naturally to', short: 'can lead to' },
});

export const OFFER_KINDS = Object.freeze({
  signature: 'Signature offer',
  premium: 'Premium offer',
  recurring: 'Recurring offer',
  other: 'Other offer',
});

export const EVIDENCE_TYPES = Object.freeze({
  fact: 'You told us',
  assumption: 'Assumption to check',
});

export const LIMITS = Object.freeze({ opportunities: 8, evidence: 6, why: 6, text: 600, name: 90 });

const str = (v, max = LIMITS.text) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const ids = (arr) => new Set((arr || []).map((x) => x.id));

/**
 * Price ranges commonly published for each funnel position (2025–2026 funnel guidance: Systeme.io,
 * Teachable, CartFlows, LTO Ads). Illustrative ranges to choose from, not rules or benchmarks.
 */
export const PRICE_RANGES = Object.freeze({
  main: { low: 7, high: 47, note: 'Most low-ticket funnels start between $7 and $47; $7 to $27 is the most common.' },
  bump: { low: 7, high: 27, note: 'Usually about 30% to 65% of the main product price.' },
  upsell: { low: 47, high: 197, note: 'Usually about 2 to 5 times the main product price.' },
  downsell: { low: 17, high: 97, note: 'Usually about 30% to 70% of the upsell price.' },
  oto: { low: 97, high: 297, note: 'The biggest step before your signature offer. Fewer sources price this separately, so treat it as a starting point.' },
});

/** Ready-made price sets the customer can apply with one click. */
export const PRICE_SETS = Object.freeze([
  { id: 'starter', label: 'Starter', prices: { main: 17, bump: 9, upsell: 47, downsell: 27, oto: 97 } },
  { id: 'growth', label: 'Growth', prices: { main: 27, bump: 17, upsell: 97, downsell: 47, oto: 197 } },
  { id: 'premium', label: 'Premium', prices: { main: 47, bump: 27, upsell: 197, downsell: 97, oto: 297 } },
]);

/**
 * Share of buyers who say yes to each extra offer. Same illustrative planning assumptions as the
 * Authority Funnel Revenue Calculator; not verified industry benchmarks or predictions.
 * The downsell rate applies only to people who declined the upsell.
 */
export const TAKE_RATES = Object.freeze({
  conservative: { label: 'Conservative', bump: 0.10, upsell: 0.03, downsell: 0.02, oto: 0.02 },
  expected: { label: 'Expected', bump: 0.20, upsell: 0.06, downsell: 0.04, oto: 0.05 },
  stretch: { label: 'Stretch', bump: 0.35, upsell: 0.15, downsell: 0.08, oto: 0.10 },
});
export const AOV_GOALS = Object.freeze([50, 100, 250, 500]);

/** Estimated average spent per buyer, for one take-rate scenario. `prices` overrides the map's own prices. */
export function estimateAov(map, scenario = 'expected', prices = null) {
  const f = funnelOf(map);
  const r = TAKE_RATES[scenario];
  const p = (k) => (f[k] ? (prices ? prices[k] : priceValue(f[k].price)) : 0);
  const up = f.upsell ? r.upsell : 0;
  return p('main') + p('bump') * r.bump + p('upsell') * up + p('downsell') * (1 - up) * r.downsell + p('oto') * r.oto;
}

/** Funnel helpers shared by the map and the AI checks. */
export function funnelOf(map) {
  const live = (map.opportunities || []).filter((o) => !o.removed);
  const bySlot = {};
  for (const k of SLOT_ORDER) bySlot[k] = live.find((o) => o.slot === k) || null;
  return bySlot;
}
export const priceValue = (p) => { const n = parseFloat(String(p || '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };
/** Combined price if one buyer says yes to every offer they can see (upsell OR downsell, never both). Same rule as the revenue calculator. */
export function totalOfferValue(map) {
  const f = funnelOf(map);
  const v = (k) => (f[k] ? priceValue(f[k].price) : 0);
  return v('main') + v('bump') + Math.max(v('upsell'), v('downsell')) + v('oto');
}

/** An opportunity backed by at least one customer-stated fact, versus pure hypothesis. */
export function evidenceStatus(opp) {
  const ev = opp.evidence || [];
  const facts = ev.filter((e) => e.type === 'fact').length;
  const assumptions = ev.filter((e) => e.type === 'assumption').length;
  if (facts && assumptions) return { key: 'mixed', label: 'Need you described, demand to test' };
  if (facts) return { key: 'evidence', label: 'Based on what you told us' };
  return { key: 'hypothesis', label: 'Hypothesis to test' };
}

/**
 * Validate and normalize a map. Returns { ok, errors, map }.
 * Problems that can be repaired safely (trimming, dropping broken references) are fixed and
 * reported as warnings; anything that would make the map misleading is an error.
 */
export function validateMap(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['The map is empty.'], warnings, map: null };
  if (input.schema !== MAP_SCHEMA) errors.push(`Unknown map format "${input.schema}".`);

  const stageIds = new Set(STAGES.map((s) => s.id));
  const b = input.business || {};
  const business = {
    name: str(b.name, LIMITS.name), what: str(b.what), buyer: str(b.buyer), buyerGoal: str(b.buyerGoal),
    exampleLabel: str(b.exampleLabel, 120),
  };
  if (!business.what) errors.push('Say what the business sells.');
  if (!business.buyer) errors.push('Say who buys from the business.');

  const offers = (input.offers || []).map((o) => ({
    id: str(o.id, 20), name: str(o.name, LIMITS.name), price: str(o.price, 40),
    kind: OFFER_KINDS[o.kind] ? o.kind : 'other', description: str(o.description),
  })).filter((o) => o.id && o.name);
  if (!offers.length) errors.push('Add at least one existing offer.');
  if (!offers.some((o) => o.kind === 'signature' || o.kind === 'premium')) warnings.push('No signature or premium offer is marked.');
  const offerIds = ids(offers);

  const process = {};
  for (const s of STAGES) process[s.id] = str(input.process?.[s.id]);

  const onStage = (x, what) => {
    if (!stageIds.has(x.stage)) { warnings.push(`${what} "${x.text || x.name}" had an unknown journey stage and was moved to "Getting started".`); return 'prepare'; }
    return x.stage;
  };
  const assets = (input.assets || []).map((a) => ({ id: str(a.id, 20), name: str(a.name, LIMITS.name), kind: str(a.kind, 40), stage: a.stage, note: str(a.note) }))
    .filter((a) => a.id && a.name).map((a) => ({ ...a, stage: onStage(a, 'Asset') }));
  const problems = (input.problems || []).map((p) => ({ id: str(p.id, 20), text: str(p.text), stage: p.stage }))
    .filter((p) => p.id && p.text).map((p) => ({ ...p, stage: onStage(p, 'Problem') }));
  const assetIds = ids(assets);
  const problemIds = ids(problems);

  const opportunities = (input.opportunities || []).slice(0, LIMITS.opportunities).map((o) => {
    const opp = {
      id: str(o.id, 20), name: str(o.name, LIMITS.name), format: str(o.format, 160), stage: o.stage,
      buyer: str(o.buyer), problem: str(o.problem), outcome: str(o.outcome),
      role: ROLES[o.role] ? o.role : 'paid', roleReason: str(o.roleReason),
      sources: {
        assets: (o.sources?.assets || []).filter((id) => assetIds.has(id)),
        problems: (o.sources?.problems || []).filter((id) => problemIds.has(id)),
      },
      connects: (o.connects || []).filter((c) => offerIds.has(c.offer) && RELATIONS[c.relation]).map((c) => ({ offer: c.offer, relation: c.relation })),
      evidence: (o.evidence || []).slice(0, LIMITS.evidence).map((e) => ({ type: e.type === 'fact' ? 'fact' : 'assumption', text: str(e.text) })).filter((e) => e.text),
      effort: str(o.effort, 160),
      slot: SLOTS[o.slot] ? o.slot : '',
      price: str(o.price, 40),
      removed: Boolean(o.removed),
    };
    if (opp.slot && opp.role !== 'paid') { warnings.push(`"${opp.name}" is in the funnel, so it was marked as a digital product.`); opp.role = 'paid'; }
    if (!ROLES[o.role]) warnings.push(`"${opp.name}" had no valid role and was set to Paid product.`);
    opp.stage = onStage(opp, 'Opportunity');
    if (!opp.evidence.length) opp.evidence.push({ type: 'assumption', text: 'No evidence recorded yet.' });
    return opp;
  }).filter((o) => o.id && o.name);
  if (!opportunities.length) errors.push('The map has no product opportunities.');
  const taken = new Set();
  for (const o of opportunities) {
    if (!o.slot) continue;
    if (o.removed) { o.slot = ''; continue; }
    if (taken.has(o.slot)) { warnings.push(`Two ideas were in the ${SLOTS[o.slot].label} position; "${o.name}" was moved out of the funnel.`); o.slot = ''; continue; }
    taken.add(o.slot);
  }
  if (taken.size && !taken.has('main')) warnings.push('The funnel has no main product yet.');
  if (taken.has('downsell') && !taken.has('upsell')) warnings.push('A downsell is only shown when someone declines an upsell, so add an upsell too.');
  if ((input.opportunities || []).length > LIMITS.opportunities) warnings.push(`Only the first ${LIMITS.opportunities} opportunities are kept.`);

  const r = input.recommendation || {};
  const live = opportunities.filter((o) => !o.removed);
  let recId = live.some((o) => o.id === r.opportunityId) ? r.opportunityId : null;
  if (!recId && live.length) { recId = live[0].id; warnings.push('The recommended opportunity was missing, so the first one is shown.'); }
  const recommendation = {
    opportunityId: recId,
    why: (r.why || []).map((x) => str(x)).filter(Boolean).slice(0, LIMITS.why),
    assumptions: (r.assumptions || []).map((x) => str(x)).filter(Boolean).slice(0, LIMITS.why),
    validationStep: str(r.validationStep, 900),
    nextStep: str(r.nextStep, 600),
  };
  if (!recommendation.validationStep) errors.push('The recommendation needs a first validation step.');

  const map = {
    schema: MAP_SCHEMA,
    business, offers, process, assets, problems, opportunities, recommendation,
    summary: str(input.summary, 1600),
    goal: AOV_GOALS.includes(Number(input.goal)) ? Number(input.goal) : 100,
    meta: { createdAt: input.meta?.createdAt || null, editedAt: input.meta?.editedAt || null, source: str(input.meta?.source, 40) || 'ai' },
  };
  return { ok: errors.length === 0, errors, warnings, map };
}
