import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMap, evidenceStatus, MAP_SCHEMA, ROLES, funnelOf, totalOfferValue, priceValue } from '../src/map-model.js';
import { EXAMPLE_MAP } from '../src/example-website-designer.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

test('the example map is valid with no warnings', () => {
  const r = validateMap(EXAMPLE_MAP);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.map.opportunities.length, 8);
});

test('example covers every role and keeps opportunities within 2–8', () => {
  const roles = new Set(EXAMPLE_MAP.opportunities.map((o) => o.role));
  assert.deepEqual([...roles].sort(), Object.keys(ROLES).sort());
  assert.ok(EXAMPLE_MAP.opportunities.length >= 2 && EXAMPLE_MAP.opportunities.length <= 8);
});

test('every example opportunity traces back to something the owner described', () => {
  for (const o of EXAMPLE_MAP.opportunities) {
    assert.ok(o.sources.assets.length + o.sources.problems.length > 0, o.name);
    assert.ok(o.evidence.some((e) => e.type === 'assumption'), `${o.name} names at least one assumption`);
    assert.ok(o.connects.length > 0, `${o.name} connects to an existing offer`);
  }
});

test('evidence status separates stated facts from hypotheses', () => {
  assert.equal(evidenceStatus({ evidence: [{ type: 'fact' }] }).key, 'evidence');
  assert.equal(evidenceStatus({ evidence: [{ type: 'fact' }, { type: 'assumption' }] }).key, 'mixed');
  assert.equal(evidenceStatus({ evidence: [{ type: 'assumption' }] }).key, 'hypothesis');
  assert.equal(evidenceStatus({}).key, 'hypothesis');
});

test('broken references are repaired, not rendered', () => {
  const m = clone(EXAMPLE_MAP);
  m.opportunities[0].sources.assets.push('a99');
  m.opportunities[0].connects.push({ offer: 'o99', relation: 'prepares' }, { offer: 'o1', relation: 'nonsense' });
  m.opportunities[1].stage = 'somewhere';
  m.opportunities[2].role = 'premium';
  const r = validateMap(m);
  assert.equal(r.ok, true);
  assert.ok(!r.map.opportunities[0].sources.assets.includes('a99'));
  assert.deepEqual(r.map.opportunities[0].connects, [{ offer: 'o1', relation: 'prepares' }]);
  assert.equal(r.map.opportunities[1].stage, 'prepare');
  assert.equal(r.map.opportunities[2].role, 'paid');
  assert.equal(r.warnings.length, 2);
});

test('a map without offers, opportunities or a validation step is rejected', () => {
  const m = clone(EXAMPLE_MAP);
  m.offers = []; m.opportunities = []; m.recommendation.validationStep = '';
  const r = validateMap(m);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3);
  assert.equal(validateMap(null).ok, false);
  assert.equal(validateMap({ ...EXAMPLE_MAP, schema: 'x' }).ok, false);
});

test('recommendation falls back to a live opportunity if its target is removed', () => {
  const m = clone(EXAMPLE_MAP);
  m.opportunities[0].removed = true;
  const r = validateMap(m);
  assert.equal(r.map.recommendation.opportunityId, 'op2');
});

test('opportunities are capped at eight and opportunities without evidence get an explicit assumption', () => {
  const m = clone(EXAMPLE_MAP);
  m.opportunities = Array.from({ length: 10 }, (_, n) => ({ ...clone(EXAMPLE_MAP.opportunities[0]), id: `x${n}`, slot: '', evidence: [] }));
  m.recommendation.opportunityId = 'x0';
  const r = validateMap(m);
  assert.equal(r.map.opportunities.length, 8);
  assert.equal(r.map.opportunities[0].evidence[0].type, 'assumption');
});

test('schema id is stable', () => assert.equal(MAP_SCHEMA, 'opportunity-map/2'));

import { EXAMPLES } from '../src/examples.js';

test('every example business produces a valid, grounded map', () => {
  assert.ok(EXAMPLES.length >= 4);
  for (const { id, map } of EXAMPLES) {
    const r = validateMap(map);
    assert.deepEqual(r.errors, [], id);
    assert.deepEqual(r.warnings, [], id);
    assert.ok(map.opportunities.length >= 2 && map.opportunities.length <= 8, id);
    assert.ok(new Set(map.opportunities.map((o) => o.role)).size >= 3, `${id} uses at least three roles`);
    for (const o of map.opportunities) {
      assert.ok(o.sources.assets.length + o.sources.problems.length > 0, `${id}: ${o.name} has a source`);
      assert.ok(o.evidence.some((e) => e.type === 'assumption'), `${id}: ${o.name} names an assumption`);
      assert.ok(o.connects.length > 0, `${id}: ${o.name} connects to an offer`);
    }
    assert.ok(map.recommendation.why.length && map.recommendation.validationStep, id);
  }
});

test('example copy avoids income and guarantee claims', () => {
  const risky = /guarantee|passive income|make \$|earn \$|six figures|proven to sell/i;
  for (const { id, map } of EXAMPLES) assert.ok(!risky.test(JSON.stringify(map)), id);
});

test('each example funnel has a main product, one idea per position and only digital products', () => {
  for (const { id, map } of EXAMPLES) {
    const r = validateMap(map);
    const f = funnelOf(r.map);
    assert.ok(f.main, `${id} has a main product`);
    assert.ok(priceValue(f.main.price) <= 50, `${id} main product is $50 or less`);
    const slotted = r.map.opportunities.filter((o) => o.slot);
    assert.equal(new Set(slotted.map((o) => o.slot)).size, slotted.length, id);
    assert.ok(slotted.every((o) => o.role === 'paid'), id);
    if (f.downsell) assert.ok(f.upsell, `${id} downsell follows an upsell`);
    assert.equal(r.map.recommendation.opportunityId, f.main.id, `${id} tests the main product first`);
  }
});

test('total offer value counts the upsell or the downsell, never both (same rule as the calculator)', () => {
  const r = validateMap(EXAMPLE_MAP);
  assert.equal(totalOfferValue(r.map), 27 + 17 + 97 + 197);
  const q = validateMap(EXAMPLES.find((x) => x.id === 'quilt').map);
  assert.equal(totalOfferValue(q.map), 27 + 12 + 37);
});

test('funnel positions are repaired: duplicates, non-products and a downsell without an upsell', () => {
  const m = clone(EXAMPLE_MAP);
  m.opportunities[1].slot = 'main';            // second main
  m.opportunities[5].slot = 'bump';            // a lead magnet placed in the funnel
  m.opportunities[2].slot = '';                // remove the upsell, keep the downsell
  const r = validateMap(m);
  const f = funnelOf(r.map);
  assert.equal(f.main.id, 'op1');
  assert.equal(r.map.opportunities[1].slot, '');
  assert.equal(r.map.opportunities[5].role, 'paid');
  assert.ok(r.warnings.some((w) => w.includes('downsell')));
});

import { estimateAov, PRICE_RANGES, PRICE_SETS, SLOT_ORDER } from '../src/map-model.js';

test('average per sale weights each extra offer by its take rate; downsell only reaches upsell decliners', () => {
  const r = validateMap(EXAMPLE_MAP).map;
  const expected = 27 + 17 * 0.2 + 97 * 0.06 + 47 * (1 - 0.06) * 0.04 + 197 * 0.05;
  assert.ok(Math.abs(estimateAov(r, 'expected') - expected) < 1e-9);
  assert.ok(estimateAov(r, 'conservative') < estimateAov(r, 'expected'));
  assert.ok(estimateAov(r, 'expected') < estimateAov(r, 'stretch'));
  assert.ok(estimateAov(r, 'stretch') < totalOfferValue(r));
});

test('a $100 average needs Premium-range prices or strong take rates (honest goal guidance)', () => {
  const r = validateMap(EXAMPLE_MAP).map;
  const growth = PRICE_SETS.find((s) => s.id === 'growth').prices;
  const premium = PRICE_SETS.find((s) => s.id === 'premium').prices;
  assert.ok(estimateAov(r, 'expected', growth) < 100);
  assert.ok(estimateAov(r, 'stretch', premium) >= 100);
});

test('price sets sit inside the published ranges and the goal defaults to $100', () => {
  for (const s of PRICE_SETS) for (const k of SLOT_ORDER) {
    assert.ok(s.prices[k] >= PRICE_RANGES[k].low && s.prices[k] <= PRICE_RANGES[k].high, `${s.id} ${k}`);
  }
  assert.equal(validateMap(EXAMPLE_MAP).map.goal, 100);
  assert.equal(validateMap({ ...EXAMPLE_MAP, goal: 250 }).map.goal, 250);
  assert.equal(validateMap({ ...EXAMPLE_MAP, goal: 7 }).map.goal, 100);
});
