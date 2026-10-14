/**
 * Digital Product Opportunity Map — screen view and editing.
 * Renders any valid "opportunity-map/1" object. Edits save in the browser.
 */
import { STAGES, ROLES, RELATIONS, OFFER_KINDS, EVIDENCE_TYPES, SLOTS, SLOT_ORDER, PRICE_RANGES, PRICE_SETS, TAKE_RATES, AOV_GOALS, validateMap, evidenceStatus, funnelOf, totalOfferValue, estimateAov } from './map-model.js';
import { EXAMPLES } from './examples.js';

const STORE = 'pig-authority-funnel-map-prototype-v2';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));

const CURRENT = `${STORE}:current`;
let exampleId = (() => { try { const id = localStorage.getItem(CURRENT); return EXAMPLES.some((x) => x.id === id) ? id : EXAMPLES[0].id; } catch { return EXAMPLES[0].id; } })();
const storeKey = () => `${STORE}:${exampleId}`;
const exampleMap = () => validateMap(clone(EXAMPLES.find((x) => x.id === exampleId).map)).map;
let map = loadMap();
let open = null; // { type: 'opp' | 'offer' | 'rec' | 'summary', id, returnTo }
let confirmRemove = false;
let resetArmed = null;
let undo = null;

function loadMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey()) || 'null');
    if (saved) {
      const r = validateMap(saved);
      if (r.ok) return r.map;
    }
  } catch { /* storage unavailable or damaged: fall back to the example */ }
  return exampleMap();
}

function switchExample(id) {
  if (!EXAMPLES.some((x) => x.id === id) || id === exampleId) return;
  exampleId = id;
  try { localStorage.setItem(CURRENT, id); } catch { /* ignore */ }
  map = loadMap(); open = null; undo = null;
  rerender();
  window.scrollTo({ top: 0 });
}

let savedTimer;
function save() {
  map.meta.editedAt = new Date().toISOString();
  map.meta.source = map.meta.source === 'example' ? 'example-edited' : map.meta.source;
  clearTimeout(savedTimer);
  let msg = 'Saved on this device';
  try { localStorage.setItem(storeKey(), JSON.stringify(map)); } catch { msg = 'This browser is not saving changes'; }
  const el = $('#saved');
  if (el) { el.textContent = 'Saving…'; savedTimer = setTimeout(() => { el.textContent = msg; }, 350); }
}

/* ---------- Lookups ---------- */
const live = () => map.opportunities.filter((o) => !o.removed);
const oppById = (id) => map.opportunities.find((o) => o.id === id);
const offerById = (id) => map.offers.find((o) => o.id === id);
const assetById = (id) => map.assets.find((a) => a.id === id);
const problemById = (id) => map.problems.find((p) => p.id === id);
const isFirst = (o) => map.recommendation.opportunityId === o.id;
const nextId = (prefix, list) => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

function sourceNames(o) {
  return [...o.sources.assets.map((id) => assetById(id)?.name), ...o.sources.problems.map((id) => problemById(id)?.text)].filter(Boolean);
}
function shortList(names, n = 2) {
  if (!names.length) return '';
  const head = names.slice(0, n).join('; ');
  return names.length > n ? `${head} + ${names.length - n} more` : head;
}

/* ---------- Rendering ---------- */
function oppCard(o) {
  const st = evidenceStatus(o);
  const src = sourceNames(o);
  const conns = o.connects.map((c) => `${RELATIONS[c.relation].label} <b>${esc(offerById(c.offer)?.name)}</b>`);
  return `<button type="button" class="opp ${isFirst(o) ? 'first' : ''}" data-opp="${esc(o.id)}" data-src="${esc([...o.sources.assets, ...o.sources.problems].join(' '))}" data-offers="${esc(o.connects.map((c) => c.offer).join(' '))}" aria-label="${esc(o.name)}: view and edit">
    ${isFirst(o) ? '<span class="ribbon">Test this first</span>' : ''}
    ${o.slot ? `<span class="slot-chip">${SLOTS[o.slot].label}${o.price ? ` · ${esc(o.price)}` : ''}</span>` : ''}
    <h3>${esc(o.name)}</h3>
    <p class="outcome">${esc(o.outcome)}</p>
    <span class="chips"><span class="role ${o.role}">${ROLES[o.role].label}</span><span class="status ${st.key}">${st.label}</span></span>
    <span class="meta">
      ${o.buyer ? `<span><b>For:</b> ${esc(o.buyer)}</span>` : ''}
      ${o.problem ? `<span><b>Problem:</b> ${esc(o.problem)}</span>` : ''}
      ${src.length ? `<span><b>Built from:</b> ${esc(shortList(src))}</span>` : '<span><b>Built from:</b> new material</span>'}
      ${conns.map((c) => `<span>${c}</span>`).join('')}
    </span>
    <span class="open">View and edit</span>
  </button>`;
}

function lane(stage) {
  const assets = map.assets.filter((a) => a.stage === stage.id);
  const problems = map.problems.filter((p) => p.stage === stage.id);
  const opps = live().filter((o) => o.stage === stage.id);
  return `<section class="lane" aria-labelledby="lane-${stage.id}">
    <div class="lane-head">
      <h2 id="lane-${stage.id}">${stage.label}</h2>
      <div class="hint">${stage.hint}</div>
      ${map.process[stage.id] ? `<p class="proc"><b>Your process</b>${esc(map.process[stage.id])}</p>` : ''}
    </div>
    <div class="group-label">Already in place</div>
    ${assets.length ? assets.map((a) => `<div class="asset" data-id="${esc(a.id)}">${esc(a.name)}${a.kind ? `<small>${esc(a.kind)}</small>` : ''}</div>`).join('') : '<div class="empty-note">Nothing yet</div>'}
    <div class="group-label">Where customers get stuck</div>
    ${problems.length ? problems.map((p) => `<div class="problem" data-id="${esc(p.id)}">${esc(p.text)}</div>`).join('') : '<div class="empty-note">Nothing mentioned</div>'}
    <div class="group-label">Suggested products</div>
    ${opps.length ? opps.map(oppCard).join('') : '<div class="empty-note">No suggestions here</div>'}
  </section>`;
}

function offerNode(o) {
  const fed = live().filter((op) => op.connects.some((c) => c.offer === o.id));
  return `<button type="button" class="offer" data-offer="${esc(o.id)}" aria-label="${esc(o.name)}: edit offer">
    <div class="k">${OFFER_KINDS[o.kind]}</div>
    <h3>${esc(o.name)} ${o.price ? `<span class="price">${esc(o.price)}</span>` : ''}</h3>
    ${o.description ? `<p>${esc(o.description)}</p>` : ''}
    <div class="fed">${fed.length ? `Connected ideas: ${fed.map((f) => esc(f.name)).join(', ')}` : 'No ideas connected yet'}</div>
  </button>`;
}

function recPanel() {
  const r = map.recommendation;
  const o = oppById(r.opportunityId);
  if (!o) return '<section class="panel rec"><p>Choose the product to test first by opening it and selecting "Test this first".</p></section>';
  return `<section class="panel rec" aria-labelledby="rec-h">
    <div class="panel-head">
      <div><div class="eyebrow">Test this first</div><h2 id="rec-h">${esc(o.name)}</h2></div>
      <button type="button" class="btn small" data-edit="rec">Edit</button>
    </div>
    <p>${esc(o.outcome)}</p>
    <h3>Why this one first</h3>
    ${r.why.length ? `<ul>${r.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="note">Add your reasons for choosing this one.</p>'}
    ${r.assumptions.length ? `<h3>What is still an assumption</h3><ul class="assume">${r.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <h3>Your first test</h3>
    <div class="step-box">${esc(r.validationStep)}</div>
    ${r.nextStep ? `<p class="note">${esc(r.nextStep)}</p>` : ''}
  </section>`;
}

function rolesPanel() {
  return `<section class="panel" aria-labelledby="roles-h">
    <div class="eyebrow">Not every idea belongs in the funnel</div>
    <h2 id="roles-h">How each idea is best used</h2>
    <div class="roles-list" style="margin-top:12px">${Object.entries(ROLES).map(([key, r]) => {
      const list = live().filter((o) => o.role === key);
      return `<div class="role-group">
        <h3><span class="role ${key}">${r.label}</span></h3>
        <p>${r.help}</p>
        ${list.length ? `<ul>${list.map((o) => `<li><button type="button" data-open="${esc(o.id)}">${esc(o.name)}</button>${key === 'paid' ? ` <small class="where">${o.slot ? SLOTS[o.slot].label : 'Store only'}</small>` : ''}</li>`).join('')}</ul>` : '<span class="none">None on this map</span>'}
      </div>`;
    }).join('')}</div>
  </section>`;
}

const money = (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function slotCard(k, o) {
  const s = SLOTS[k];
  if (!o) {
    return `<button type="button" class="slot empty" data-slot="${k}" aria-label="${s.label}: choose an idea">
      <span class="slot-k">${s.label}</span><span class="slot-when">${s.when}</span>
      <span class="slot-add">Optional. Choose an idea</span></button>`;
  }
  const have = o.sources.assets.map((id) => assetById(id)?.name).filter(Boolean);
  return `<button type="button" class="slot ${isFirst(o) ? 'first' : ''}" data-opp="${esc(o.id)}" aria-label="${s.label}: ${esc(o.name)}, view and edit">
    <span class="slot-k">${s.label}${o.price ? `<b class="slot-price">${esc(o.price)}</b>` : ''}</span>
    <span class="slot-when">${s.when}</span>
    <h3>${esc(o.name)}</h3>
    ${o.problem ? `<span class="slot-line"><b>Solves:</b> ${esc(o.problem)}</span>` : ''}
    ${o.outcome ? `<span class="slot-line"><b>Result:</b> ${esc(o.outcome)}</span>` : ''}
    <span class="have ${have.length ? 'yes' : 'no'}">${have.length ? `You already have: ${esc(shortList(have))}` : 'New material to create'}</span>
  </button>`;
}

function funnelSection() {
  const f = funnelOf(map);
  const sig = map.offers.find((o) => o.kind === 'signature') || map.offers.find((o) => o.kind === 'premium') || map.offers[0];
  const count = SLOT_ORDER.filter((k) => f[k]).length;
  const ready = SLOT_ORDER.filter((k) => f[k]?.sources.assets.length).length;
  const total = totalOfferValue(map);
  return `<section class="funnel" aria-labelledby="fun-h">
    <div class="fun-head">
      <div>
        <div class="eyebrow">Your Authority Funnel</div>
        <h2 id="fun-h">${count ? `${count} digital product${count > 1 ? 's' : ''}, each one step closer to ${esc(sig?.name || 'your signature offer')}` : 'Choose your first digital product'}</h2>
        <p>Each product solves one specific problem. You do not need all five: start with a main product and add more when you are ready. Each one you add gives buyers another way to go further.${ready ? ` <b>${ready} of ${count} use material you already have.</b>` : ''}</p>
      </div>
      <dl class="aov">
        <div><dt>Main product</dt><dd>${f.main?.price ? esc(f.main.price) : '—'}</dd></div>
        <div><dt>Average per sale (estimate)</dt><dd>${f.main?.price ? money(Math.round(estimateAov(map, 'expected'))) : '—'}</dd></div>
        <div><dt>If someone says yes to every offer</dt><dd>${total ? money(total) : '—'}</dd></div>
      </dl>
    </div>
    <div class="fun-flow">
      <div class="fun-col">${slotCard('main', f.main)}</div>
      <div class="fun-col">${slotCard('bump', f.bump)}</div>
      <div class="fun-col branch">${slotCard('upsell', f.upsell)}<div class="branch-note" aria-hidden="true">If they say no</div>${slotCard('downsell', f.downsell)}</div>
      <div class="fun-col">${slotCard('oto', f.oto)}</div>
      <div class="fun-col dest-col">
        ${sig ? `<button type="button" class="dest" data-offer="${esc(sig.id)}" aria-label="${esc(sig.name)}: edit offer">
          <span class="slot-k">Leads to your ${esc(OFFER_KINDS[sig.kind].toLowerCase())}</span>
          <h3>${esc(sig.name)}${sig.price ? ` <span class="price">${esc(sig.price)}</span>` : ''}</h3>
          ${sig.description ? `<p>${esc(sig.description)}</p>` : ''}
          <span class="dest-note">Your emails and follow-up invite funnel buyers here.</span>
        </button>` : ''}
      </div>
    </div>
    <p class="note fun-foot">Every product in your funnel can also be sold on its own in your store. The average per sale uses expected take rates, explained below. "Yes to every offer" counts the upsell or the downsell, never both. Neither is a forecast.</p>
  </section>`;
}

function pricingPanel() {
  const f = funnelOf(map);
  const goal = map.goal;
  const est = Object.fromEntries(Object.keys(TAKE_RATES).map((k) => [k, Math.round(estimateAov(map, k))]));
  const filled = SLOT_ORDER.filter((k) => f[k]);
  const setAov = (s) => Math.round(estimateAov(map, 'expected', s.prices));
  let msg;
  if (!f.main) msg = 'Choose a main product to see what each sale could bring in.';
  else if (est.expected >= goal) msg = `At expected take rates your funnel averages about ${money(est.expected)} per sale, which meets your ${money(goal)} goal.`;
  else if (est.stretch >= goal) msg = `At expected take rates your funnel averages about ${money(est.expected)} per sale. You would reach ${money(goal)} only with strong take rates, so consider higher prices or ${filled.length < 5 ? 'adding the empty positions' : 'a higher-priced one-time offer'}.`;
  else msg = `At expected take rates your funnel averages about ${money(est.expected)} per sale. To average ${money(goal)}, most of the gap has to come from a higher main price and a bigger upsell and one-time offer${filled.length < 5 ? ', or from filling the empty positions' : ''}. Most buyers take only the main product, so that price matters most.`;
  return `<section class="panel pricing" aria-labelledby="price-h">
    <div class="eyebrow">Pricing and average order value</div>
    <h2 id="price-h">What could each sale bring in?</h2>
    <p class="lead">Your average order value is what a buyer spends on average. Most buyers take only the main product, and a smaller share say yes to each extra offer, so your average sits well below the "yes to every offer" total.</p>
    <div class="goal" role="radiogroup" aria-label="Your goal per sale"><span>Your goal per sale:</span>${AOV_GOALS.map((g) => `<button type="button" role="radio" aria-checked="${g === goal}" class="goal-chip ${g === goal ? 'on' : ''}" data-goal="${g}">${money(g)}</button>`).join('')}</div>
    <div class="est">${Object.entries(TAKE_RATES).map(([k, r]) => `<div class="est-card ${f.main && est[k] >= goal ? 'met' : ''}"><span>${r.label}</span><b>${f.main ? money(est[k]) : '—'}</b><small>${f.main && est[k] >= goal ? 'Meets your goal' : 'Average per sale'}</small></div>`).join('')}</div>
    <p class="goal-msg">${msg}</p>
    <h3>Price ranges to choose from</h3>
    <ul class="ranges">${SLOT_ORDER.map((k) => { const r = PRICE_RANGES[k]; const o = f[k]; return `<li class="${o ? '' : 'off'}">
      <div class="rg-top"><b>${SLOTS[k].label}</b><span class="rg">$${r.low} to $${r.high}</span><span class="yours">${o ? (o.price ? `Yours: ${esc(o.price)}` : 'No price yet') : 'Not in your funnel'}</span></div>
      <small>${r.note}</small></li>`; }).join('')}</ul>
    <h3>Or start from a price set</h3>
    <div class="sets">${PRICE_SETS.map((s) => `<div class="set"><b>${s.label}</b><span>${SLOT_ORDER.map((k) => `${SHORT[k]} $${s.prices[k]}`).join(' · ')}</span>
      <small>${f.main ? `About ${money(setAov(s))} per sale with your positions, at expected rates` : ''}</small>
      <button type="button" class="btn small" data-priceset="${s.id}" ${filled.length ? '' : 'disabled'}>Use these prices</button></div>`).join('')}</div>
    <p class="note">Ranges come from widely published low-ticket funnel guidance (2025 to 2026). Take rates are the same illustrative planning assumptions as the Authority Funnel Revenue Calculator, for example 20% of buyers adding the bump and 6% taking the upsell at expected rates. They are not verified benchmarks or predictions. Test with your own buyers, then use the calculator to model traffic and profit.</p>
  </section>`;
}
const SHORT = { main: 'Main', bump: 'Bump', upsell: 'Upsell', downsell: 'Downsell', oto: 'OTO' };

const ARROW = (cls) => `<svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" class="${cls}" style="stroke-width:2;${cls === 'supports' ? 'stroke-dasharray:6 5;' : cls === 'leads' ? 'stroke-dasharray:2 5;stroke-linecap:round;' : ''}stroke:var(--rel-${cls})"></line></svg>`;

function renderMain() {
  const b = map.business;
  const removed = map.opportunities.filter((o) => o.removed);
  $('#app').innerHTML = `
  <div class="review-bar"><div class="wrap">
    <span><b>Prototype review.</b> The finished map works the same way for any established business. See it for:</span>
    <label class="sr" for="exampleSwitch">Example business</label>
    <select id="exampleSwitch" data-switch="1">${EXAMPLES.map((x) => `<option value="${x.id}" ${x.id === exampleId ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
  </div></div>
  <header class="mast">
    <div class="wrap mast-grid">
      <div>
        <div class="kicker">${b.exampleLabel ? `<span class="tag">${esc(b.exampleLabel)}</span>` : ''}<span class="tag">Authority Funnel Map</span></div>
        <h1>The products already hiding in <span>${esc(b.name || 'your business')}</span></h1>
        <p class="biz"><b>You sell:</b> ${esc(b.what)}.<br><b>Your customers:</b> ${esc(b.buyer)}, looking for ${esc(lowerFirst(b.buyerGoal))}.</p>
      </div>
      <div class="insum">
        <h2>In short</h2>
        <p>${esc(map.summary)}</p>
        <button type="button" class="btn quiet small" data-edit="summary" style="color:var(--gold);margin-top:8px;padding-left:0">Edit summary</button>
      </div>
    </div>
  </header>

  <main class="wrap">
    <div class="toolbar">
      <div class="legend" aria-label="Key">
        <span><i class="sw k-asset"></i>Already in place</span>
        <span><i class="sw k-problem"></i>Where customers get stuck</span>
        <span><i class="sw k-opp"></i>Suggested product</span>
        <span><i class="sw k-first"></i>Test first</span>
      </div>
      <div class="tools">
        <span class="saved" id="saved" role="status">${map.meta.editedAt ? 'Saved on this device' : 'Example map'}</span>
        <button type="button" class="btn small" data-act="add">Add an idea</button>
        <button type="button" class="btn small quiet" data-act="reset">${resetArmed ? 'Click again to reset' : 'Reset to example'}</button>
      </div>
    </div>

    ${funnelSection()}
    ${pricingPanel()}

    <div class="below">${recPanel()}${rolesPanel()}</div>

    <div class="section-head">
      <h2>Where these ideas came from</h2>
      <p>Your customer journey, what you already have and where customers get stuck. Hover or tap an idea to see what it was built from and which offer it connects to. Buyers can start anywhere: these are options, not a fixed path.</p>
    </div>

    <div class="board-wrap" id="boardWrap">
      <svg class="links" id="links" aria-hidden="true"></svg>
      <div class="board">${STAGES.map(lane).join('')}</div>
      <section class="rail" aria-labelledby="rail-h">
        <div class="rail-head"><h2 id="rail-h">Your existing offers</h2><p>The larger offers these ideas can prepare people for, support or lead to.</p></div>
        <div class="offers">${map.offers.map(offerNode).join('')}</div>
        <div class="rel-key" aria-label="Connection key">
          ${Object.entries(RELATIONS).map(([k, r]) => `<span>${ARROW(k)}${r.label}</span>`).join('')}
        </div>
      </section>
    </div>

    ${removed.length ? `<details class="removed"><summary>Removed ideas (${removed.length})</summary><ul>${removed.map((o) => `<li>${esc(o.name)} <button type="button" class="btn quiet small" data-restore="${esc(o.id)}">Restore</button></li>`).join('')}</ul></details>` : ''}

    <section class="fits" aria-label="Where this map fits">
      <ol class="chips-row">
        <li>High-value lead magnet</li><li>Entry offer</li>
        <li class="here">Authority Funnel: this map</li>
        <li>Bridge offer</li><li>Signature offer</li><li>Membership or retreats</li>
      </ol>
      <p>Your Offer Map has several parts. This map covers one of them: the digital products in your Authority Funnel. Building the funnel pages, emails and workflows that lead buyers to your signature offer comes next.</p>
    </section>
  </main>
  <footer class="wrap foot"><span>Prototype for review. ${map.meta.source?.startsWith('example') ? 'Example data. ' : ''}Changes save in this browser only.</span><span>Expertise-to-Digital-Product Creator, map prototype v0.5.0</span></footer>`;
  requestAnimationFrame(drawLinks);
}

function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : ''; }

/* ---------- Connectors ---------- */
function drawLinks() {
  const svg = $('#links');
  const wrap = $('#boardWrap');
  if (!svg || !wrap) return;
  if (window.innerWidth <= 1000) { svg.innerHTML = ''; return; }
  const W = wrap.getBoundingClientRect();
  const markers = Object.keys(RELATIONS).map((k) => `<marker id="arr-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--rel-${k})"></path></marker>`).join('');
  const paths = [];
  const laneCount = {};
  const offerCount = {};
  const offerTotals = {};
  for (const o of live()) for (const c of o.connects) offerTotals[c.offer] = (offerTotals[c.offer] || 0) + 1;

  for (const o of live()) {
    const card = wrap.querySelector(`.opp[data-opp="${CSS.escape(o.id)}"]`);
    if (!card) continue;
    const laneEl = card.closest('.lane');
    const L = laneEl.getBoundingClientRect();
    const C = card.getBoundingClientRect();
    for (const c of o.connects) {
      const offerEl = wrap.querySelector(`.offer[data-offer="${CSS.escape(c.offer)}"]`);
      if (!offerEl) continue;
      const O = offerEl.getBoundingClientRect();
      const k = (laneCount[o.stage] = (laneCount[o.stage] || 0) + 1) - 1;
      const n = (offerCount[c.offer] = (offerCount[c.offer] || 0) + 1) - 1;
      const total = offerTotals[c.offer];
      const x1 = C.right - W.left;
      const y1 = C.top - W.top + Math.min(34, C.height / 2);
      const gx = L.right - W.left + 6 + k * 5; // run down the gutter beside the lane
      const ex = O.left - W.left + O.width * ((n + 1) / (total + 1));
      const ey = O.top - W.top - 3;
      const turn = ey - 34;
      const d = `M${x1},${y1} L${gx},${y1} L${gx},${turn} C${gx},${turn + 22} ${ex},${turn + 6} ${ex},${ey}`;
      paths.push(`<path d="${d}" class="${c.relation}" data-opp="${esc(o.id)}" data-offer="${esc(c.offer)}" marker-end="url(#arr-${c.relation})"></path>`);
    }
  }
  svg.setAttribute('viewBox', `0 0 ${W.width} ${W.height}`);
  svg.innerHTML = `<defs>${markers}</defs>${paths.join('')}`;
}

/* ---------- Highlight what an idea came from ---------- */
function focusOn({ opp, offer }) {
  const wrap = $('#boardWrap');
  if (!wrap) return;
  clearFocus();
  wrap.classList.add('focusing');
  const lit = (el) => el && el.classList.add('lit');
  if (opp) {
    const card = wrap.querySelector(`.opp[data-opp="${CSS.escape(opp)}"]`);
    lit(card);
    (card?.dataset.src || '').split(' ').filter(Boolean).forEach((id) => wrap.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach(lit));
    (card?.dataset.offers || '').split(' ').filter(Boolean).forEach((id) => lit(wrap.querySelector(`.offer[data-offer="${CSS.escape(id)}"]`)));
    wrap.querySelectorAll(`svg.links path[data-opp="${CSS.escape(opp)}"]`).forEach(lit);
  }
  if (offer) {
    lit(wrap.querySelector(`.offer[data-offer="${CSS.escape(offer)}"]`));
    wrap.querySelectorAll('.opp').forEach((c) => { if ((c.dataset.offers || '').split(' ').includes(offer)) lit(c); });
    wrap.querySelectorAll(`svg.links path[data-offer="${CSS.escape(offer)}"]`).forEach(lit);
  }
}
function clearFocus() {
  const wrap = $('#boardWrap');
  if (!wrap) return;
  wrap.classList.remove('focusing');
  wrap.querySelectorAll('.lit').forEach((el) => el.classList.remove('lit'));
}

/* ---------- Drawer ---------- */
function field(label, key, value, { area = false, sub = '' } = {}) {
  const id = `f-${key}`;
  return `<div class="f"><label for="${id}">${label}${sub ? ` <span class="sub">${sub}</span>` : ''}</label>${area
    ? `<textarea id="${id}" data-f="${key}">${esc(value)}</textarea>`
    : `<input type="text" id="${id}" data-f="${key}" value="${esc(value)}">`}</div>`;
}

function drawerOpp(o) {
  const src = [
    ...o.sources.assets.map((id) => assetById(id)).filter(Boolean).map((a) => `<span class="a">${esc(a.name)}</span>`),
    ...o.sources.problems.map((id) => problemById(id)).filter(Boolean).map((p) => `<span class="p">${esc(p.text)}</span>`),
  ];
  return `
    <header><div><h2 id="dr-h">${esc(o.name)}</h2><p>${evidenceStatus(o).label}. Changes save automatically.</p></div><button type="button" class="x" data-act="close" aria-label="Close">×</button></header>
    <div class="body">
      ${field('Product name', 'name', o.name)}
      ${field('What it is', 'format', o.format)}
      ${field('Who it is for', 'buyer', o.buyer, { area: true })}
      ${field('Their problem', 'problem', o.problem, { area: true })}
      ${field('The result they get', 'outcome', o.outcome, { area: true })}
      <div class="f"><span class="lbl">How it is best used</span><div class="role-pick" role="radiogroup">${Object.entries(ROLES).map(([k, r]) => `
        <label><input type="radio" name="role" value="${k}" ${o.role === k ? 'checked' : ''}><b>${r.label}</b><small>${r.help}</small></label>`).join('')}</div></div>
      ${field('Why this role', 'roleReason', o.roleReason, { area: true })}
      <div class="f"><label for="f-slot">Place in your Authority Funnel</label><select id="f-slot" data-slotpick="1">
        <option value="">Not in the funnel</option>${SLOT_ORDER.map((k) => { const cur = funnelOf(map)[k]; return `<option value="${k}" ${o.slot === k ? 'selected' : ''}>${SLOTS[k].label}${cur && cur.id !== o.id ? ` (replaces ${esc(cur.name)})` : ''}</option>`; }).join('')}</select>
        ${o.slot ? `<span class="sub" style="display:block;margin-top:6px">${SLOTS[o.slot].when}. ${SLOTS[o.slot].priceHint}.</span>` : ''}</div>
      ${o.slot ? field('Price', 'price', o.price, { sub: `Common range: $${PRICE_RANGES[o.slot].low} to $${PRICE_RANGES[o.slot].high}` }) : ''}
      <div class="f"><span class="lbl">Connection to your offers</span>${map.offers.map((of) => {
        const c = o.connects.find((x) => x.offer === of.id);
        return `<div class="conn-row"><span>${esc(of.name)}</span><select aria-label="Connection to ${esc(of.name)}" data-conn="${esc(of.id)}">
          <option value="">Not connected</option>${Object.entries(RELATIONS).map(([k, r]) => `<option value="${k}" ${c?.relation === k ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>`;
      }).join('')}</div>
      <div class="f"><span class="lbl">Evidence <span class="sub">Mark what you know for sure and what is still a guess</span></span>
        ${o.evidence.map((e, n) => `<div class="ev-row">
          <textarea aria-label="Evidence ${n + 1}" data-ev="${n}">${esc(e.text)}</textarea>
          <button type="button" class="toggle ${e.type}" data-evtype="${n}" aria-label="Change to ${e.type === 'fact' ? 'assumption' : 'fact'}">${EVIDENCE_TYPES[e.type]}</button>
          <button type="button" class="x" data-evdel="${n}" aria-label="Delete evidence ${n + 1}">×</button></div>`).join('')}
        <button type="button" class="btn small quiet" data-act="addEv">Add evidence or an assumption</button>
      </div>
      <div class="f"><label for="f-stage">Where it fits in the client journey</label><select id="f-stage" data-f="stage">${STAGES.map((s) => `<option value="${s.id}" ${o.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
      ${field('Effort to create', 'effort', o.effort)}
      <div class="f"><span class="lbl">Built from</span>${src.length ? `<div class="src-list">${src.join('')}</div>` : '<span class="note">New material, not yet in your business.</span>'}</div>
      ${confirmRemove ? `<div class="confirm" role="alert">Remove "${esc(o.name)}" from the map? You can restore it from Removed ideas.<div style="display:flex;gap:8px"><button type="button" class="btn small danger" data-act="removeYes">Remove</button><button type="button" class="btn small" data-act="removeNo">Keep it</button></div></div>` : ''}
    </div>
    <footer>
      <button type="button" class="btn small ${isFirst(o) ? '' : 'solid'}" data-act="makeFirst" ${isFirst(o) ? 'disabled' : ''}>${isFirst(o) ? 'Test first (current)' : 'Test this first'}</button>
      <button type="button" class="btn small danger" data-act="remove">Remove from map</button>
    </footer>`;
}

function drawerOffer(of) {
  return `
    <header><div><h2 id="dr-h">${esc(of.name)}</h2><p>One of your existing offers. Changes save automatically.</p></div><button type="button" class="x" data-act="close" aria-label="Close">×</button></header>
    <div class="body">
      ${field('Offer name', 'name', of.name)}
      ${field('Price', 'price', of.price)}
      <div class="f"><label for="f-kind">Type</label><select id="f-kind" data-f="kind">${Object.entries(OFFER_KINDS).map(([k, v]) => `<option value="${k}" ${of.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${field('Description', 'description', of.description, { area: true })}
    </div>`;
}

function drawerRec() {
  const r = map.recommendation;
  return `
    <header><div><h2 id="dr-h">Recommended first step</h2><p>One reason, assumption or note per line.</p></div><button type="button" class="x" data-act="close" aria-label="Close">×</button></header>
    <div class="body">
      <div class="f"><label for="r-why">Why this one first</label><textarea id="r-why" data-lines="why" style="min-height:150px">${esc(r.why.join('\n'))}</textarea></div>
      <div class="f"><label for="r-as">What is still an assumption</label><textarea id="r-as" data-lines="assumptions">${esc(r.assumptions.join('\n'))}</textarea></div>
      <div class="f"><label for="r-vs">Your first test</label><textarea id="r-vs" data-rf="validationStep" style="min-height:110px">${esc(r.validationStep)}</textarea></div>
    </div>`;
}

function drawerSummary() {
  return `
    <header><div><h2 id="dr-h">In short</h2><p>The summary at the top of your map.</p></div><button type="button" class="x" data-act="close" aria-label="Close">×</button></header>
    <div class="body"><div class="f"><label for="s-sum">Summary</label><textarea id="s-sum" data-sum="1" style="min-height:240px">${esc(map.summary)}</textarea></div></div>`;
}

function drawerSlot(k) {
  const s = SLOTS[k];
  const options = live().filter((o) => !o.slot);
  return `
    <header><div><h2 id="dr-h">${s.label}</h2><p>${s.when}. ${s.priceHint}.</p></div><button type="button" class="x" data-act="close" aria-label="Close">×</button></header>
    <div class="body">
      <p class="note">Choose an idea from your map to place here, or add a new one.</p>
      <div class="pick-list">${options.length ? options.map((o) => `<button type="button" class="pick" data-place="${esc(o.id)}"><b>${esc(o.name)}</b><span>${esc(o.outcome || o.problem)}</span><small class="role ${o.role}">${ROLES[o.role].label}</small></button>`).join('') : '<p class="note">Every idea is already in the funnel.</p>'}</div>
    </div>
    <footer><button type="button" class="btn small solid" data-act="addHere">Add a new idea here</button></footer>`;
}

function placeInSlot(o, k) {
  if (!k) { o.slot = ''; return; }
  const cur = funnelOf(map)[k];
  if (cur && cur.id !== o.id) { cur.slot = ''; showToast(`"${cur.name}" moved out of the funnel. It is still on your map.`); }
  o.slot = k; o.role = 'paid';
  if (!o.price) o.price = '';
}

function renderDrawer({ focus = false } = {}) {
  const root = $('#drawerRoot');
  if (!open) { root.innerHTML = ''; return; }
  const body = open.type === 'opp' ? drawerOpp(oppById(open.id))
    : open.type === 'offer' ? drawerOffer(offerById(open.id))
    : open.type === 'slot' ? drawerSlot(open.id)
    : open.type === 'rec' ? drawerRec() : drawerSummary();
  const scroll = $('.drawer .body', root)?.scrollTop || 0;
  root.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-h">${body}</aside>`;
  const b = $('.drawer .body', root);
  if (b) b.scrollTop = scroll;
  if (focus) $('.drawer input, .drawer textarea, .drawer select', root)?.focus();
}

function openDrawer(type, id, returnTo) {
  open = { type, id, returnTo };
  confirmRemove = false;
  clearFocus();
  renderDrawer({ focus: true });
}
function closeDrawer() {
  const back = open?.returnTo;
  open = null; confirmRemove = false;
  renderDrawer();
  if (back) document.querySelector(back)?.focus();
}

/* ---------- Actions ---------- */
function setFirst(o) {
  const r = map.recommendation;
  r.opportunityId = o.id;
  r.why = [];
  r.assumptions = o.evidence.filter((e) => e.type === 'assumption').map((e) => e.text);
  r.validationStep = `Before building anything new, describe "${o.name}" in two sentences to five people who match "${o.buyer}". Ask whether it would help them and whether they would pay for it, and write down what they say.`;
}

function removeOpp(o) {
  o.removed = true;
  const wasFirst = isFirst(o);
  if (wasFirst) {
    const next = live()[0];
    if (next) setFirst(next); else map.recommendation.opportunityId = null;
  }
  undo = { id: o.id, wasFirst, slot: o.slot, rec: wasFirst ? clone(map.recommendation) : null };
  o.slot = '';
  showToast(`Removed "${o.name}".`, 'Undo');
}

let toastTimer;
function showToast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" data-act="undo">${action}</button>` : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; undo = null; }, 7000);
}

function rerender() {
  renderMain();
  renderDrawer();
}

/* ---------- Events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, .scrim');
  if (!t) return;
  const d = t.dataset;

  if (d.goal) { map.goal = +d.goal; save(); rerender(); $(`[data-goal="${d.goal}"]`)?.focus(); return; }
  if (d.priceset) {
    const set = PRICE_SETS.find((x) => x.id === d.priceset); const f = funnelOf(map);
    SLOT_ORDER.forEach((k) => { if (f[k]) f[k].price = `$${set.prices[k]}`; });
    save(); rerender(); showToast(`${set.label} prices applied. You can still change any of them.`); return;
  }
  if (d.slot) return openDrawer('slot', d.slot, `[data-slot="${d.slot}"]`);
  if (d.place) { const p = oppById(d.place); placeInSlot(p, open.id); save(); open = null; rerender(); return; }
  if (d.opp) return openDrawer('opp', d.opp, t.classList.contains('slot') ? `.slot[data-opp="${CSS.escape(d.opp)}"]` : `.opp[data-opp="${CSS.escape(d.opp)}"]`);
  if (d.open) return openDrawer('opp', d.open, `[data-open="${CSS.escape(d.open)}"]`);
  if (d.offer) return openDrawer('offer', d.offer, `.offer[data-offer="${CSS.escape(d.offer)}"]`);
  if (d.edit) return openDrawer(d.edit, null, `[data-edit="${d.edit}"]`);
  if (d.restore) { const o = oppById(d.restore); o.removed = false; save(); rerender(); showToast(`Restored "${o.name}".`); return; }

  const o = open?.type === 'opp' ? oppById(open.id) : null;
  if (d.evtype !== undefined && o) { const ev = o.evidence[+d.evtype]; ev.type = ev.type === 'fact' ? 'assumption' : 'fact'; save(); rerender(); return; }
  if (d.evdel !== undefined && o) { o.evidence.splice(+d.evdel, 1); save(); rerender(); return; }

  switch (d.act) {
    case 'close': return closeDrawer();
    case 'addEv': o.evidence.push({ type: 'assumption', text: '' }); save(); renderDrawer(); $(`.drawer [data-ev="${o.evidence.length - 1}"]`)?.focus(); return;
    case 'makeFirst': setFirst(o); save(); rerender(); showToast(`"${o.name}" is now the one to test first. Add your reasons in the recommendation.`); return;
    case 'remove': confirmRemove = true; renderDrawer(); return;
    case 'removeNo': confirmRemove = false; renderDrawer(); return;
    case 'removeYes': removeOpp(o); open = null; confirmRemove = false; save(); rerender(); return;
    case 'undo': {
      if (!undo) return;
      const r = oppById(undo.id); r.removed = false;
      if (undo.slot && !funnelOf(map)[undo.slot]) r.slot = undo.slot;
      if (undo.wasFirst) { map.recommendation.opportunityId = r.id; }
      undo = null; $('#toast').hidden = true; save(); rerender(); return;
    }
    case 'add':
    case 'addHere': {
      const slot = d.act === 'addHere' ? open.id : '';
      const id = nextId('op', map.opportunities);
      map.opportunities.push({
        id, name: 'New product idea', format: '', stage: 'prepare', buyer: '', problem: '', outcome: '',
        role: 'paid', roleReason: '', sources: { assets: [], problems: [] }, connects: [],
        evidence: [{ type: 'assumption', text: 'Not checked yet.' }], effort: '', slot: '', price: '', removed: false,
      });
      if (slot) placeInSlot(oppById(id), slot);
      save(); renderMain(); openDrawer('opp', id, `.opp[data-opp="${id}"]`); $('#f-name')?.select(); return;
    }
    case 'reset': {
      if (!resetArmed) { resetArmed = setTimeout(() => { resetArmed = null; renderMain(); }, 4000); renderMain(); return; }
      clearTimeout(resetArmed); resetArmed = null;
      try { localStorage.removeItem(storeKey()); } catch { /* ignore */ }
      map = exampleMap(); open = null; rerender(); showToast('Map reset to the example.'); return;
    }
    default:
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (!open) return;
  if (open.type === 'opp') {
    const o = oppById(open.id);
    if (t.dataset.f) o[t.dataset.f] = t.value;
    else if (t.name === 'role') { o.role = t.value; if (o.role !== 'paid' && o.slot) { o.slot = ''; showToast(`"${o.name}" was taken out of the funnel, because only digital products go there.`); } renderDrawer(); }
    else if (t.dataset.slotpick !== undefined) { if (o.slot !== t.value) { placeInSlot(o, t.value); renderDrawer(); } }
    else if (t.dataset.ev !== undefined) o.evidence[+t.dataset.ev].text = t.value;
    else if (t.dataset.conn !== undefined) {
      o.connects = o.connects.filter((c) => c.offer !== t.dataset.conn);
      if (t.value) o.connects.push({ offer: t.dataset.conn, relation: t.value });
    }
    if (t.dataset.f === 'name') $('#dr-h').textContent = t.value;
  } else if (open.type === 'offer') {
    const of = offerById(open.id);
    if (t.dataset.f) of[t.dataset.f] = t.value;
  } else if (open.type === 'rec') {
    const r = map.recommendation;
    if (t.dataset.lines) r[t.dataset.lines] = t.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (t.dataset.rf) r[t.dataset.rf] = t.value;
  } else if (open.type === 'summary') {
    map.summary = t.value;
  }
  save();
  renderMain();
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.switch) { switchExample(e.target.value); return; }
  if (open && (e.target.tagName === 'SELECT' || e.target.type === 'radio')) e.target.dispatchEvent(new Event('input', { bubbles: true }));
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) closeDrawer(); });

const hover = (e) => {
  const card = e.target.closest?.('.opp, .offer');
  if (!card || open) return;
  if (card.classList.contains('opp')) focusOn({ opp: card.dataset.opp });
  else focusOn({ offer: card.dataset.offer });
};
document.addEventListener('mouseover', hover);
document.addEventListener('focusin', hover);
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('.opp, .offer') && !e.relatedTarget?.closest?.('.opp, .offer')) clearFocus(); });
document.addEventListener('focusout', (e) => { if (e.target.closest?.('.opp, .offer')) clearFocus(); });

let raf;
const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawLinks); };
window.addEventListener('resize', relayout);
if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
document.fonts?.ready?.then(relayout);

renderMain();
