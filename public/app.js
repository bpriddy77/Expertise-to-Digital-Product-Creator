/**
 * Authority Funnel Map app (v0.6.0).
 * Screens: welcome (no link) → intro → interview (5 stages) → review → generating → map.
 * Shared maps open read-only with ?view=<token>. Work saves to the buyer's account automatically,
 * with a copy kept in this browser in case the connection drops.
 */
import { STAGES, QUESTIONS, readyToMap, ESSENTIAL, LIMITS_INTERVIEW } from './shared/interview.js';
import { AOV_GOALS } from './shared/map-model.js';
import { EXAMPLE_MAP } from './shared/example-map.js';
import { CONFIG } from './shared/config.js';
import { APP_VERSION } from './shared/version.js';
import { mountMap, unmountMap, currentMap, showToast } from './map-view.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const TOKEN_KEY = 'afm-token';
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const S = {
  token: '', buyer: null, answers: {}, map: null, progress: { index: 0, phase: 'intro', goal: 100 },
  sharedAt: null, updatedAt: null, tailored: {}, ack: {}, fuOpen: {}, thinking: false,
  returnToReview: false, missingInfo: '', showDelete: false, note: '', confirmFresh: false,
};

/* ---------- Storage helpers (all wrapped: storage can be blocked) ---------- */
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const backupKey = () => `afm-backup:${S.token.slice(0, 36)}`;
function backup() { ls.set(backupKey(), JSON.stringify({ answers: S.answers, map: S.map, progress: S.progress, at: new Date().toISOString() })); }

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(S.token ? { 'x-map-token': S.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    const e = new Error('You seem to be offline. Your work is kept in this browser and will save when you are back online.'); e.status = 0; e.retryable = true; throw e;
  }
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || data.ok === false) {
    const e = new Error(data.error || 'Something went wrong. Try again.');
    Object.assign(e, { status: res.status, detail: data.detail, retryable: data.retryable });
    throw e;
  }
  return data;
}
const errText = (e) => `${esc(e.message)}${DEBUG && e.detail ? `<br><small>${esc(e.detail)}</small>` : ''}`;

/* ---------- Saving ---------- */
let saveTimer; let queued = {}; let saving = false;
function setSaved(text) {
  for (const el of document.querySelectorAll('#saved, #savedPill')) el.textContent = text;
}
function queueSave(patch, { now = false } = {}) {
  Object.assign(queued, patch);
  backup();
  setSaved('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, now ? 0 : 800);
}
async function flush() {
  if (saving) { saveTimer = setTimeout(flush, 400); return; }
  const body = queued; queued = {};
  if (!Object.keys(body).length) return;
  saving = true;
  try {
    const r = await api('/api/me', { method: 'PUT', body });
    S.updatedAt = r.savedAt;
    setSaved('Saved');
  } catch (e) {
    queued = { ...body, ...queued };
    if (e.status === 401) { setSaved('Not saved: link no longer valid'); return; }
    setSaved('Not saved yet. Retrying…');
    saveTimer = setTimeout(flush, 5000);
  } finally {
    saving = false;
  }
}
window.addEventListener('beforeunload', (e) => { if (Object.keys(queued).length) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Shared pieces ---------- */
const topbar = () => `<div class="topbar"><div class="wrap">
  <div class="brand"><img src="assets/pig-monogram-gold.png" alt=""><span><b>Authority Funnel Map</b> by ${esc(CONFIG.brand)}</span></div>
  ${S.token ? '<span class="saved-pill" id="savedPill" role="status">Saved</span>' : ''}
</div></div>`;

const resendForm = (title = 'Already bought? Get your link again') => `
  <div class="card" style="margin-top:18px">
    <h2>${title}</h2>
    <p>Enter the email you used to buy and we will send your personal link again.</p>
    <form class="inline-form" data-ui-form="resend">
      <label class="sr" for="resendEmail">Email</label>
      <input id="resendEmail" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required>
      <button class="btn solid" type="submit">Email me my link</button>
    </form>
    <div id="resendMsg"></div>
  </div>`;

/* ---------- Screens ---------- */
function renderWelcome(errorMsg = '') {
  unmountMap();
  app.innerHTML = `${topbar()}
  <section class="hero"><div class="wrap">
    <div class="eyebrow">Authority Funnel Map</div>
    <h1>Find the digital products already <span>hiding inside your business</span>.</h1>
    <p class="sub">Turn the processes, explanations and resources you already use with clients into a clear map of digital products, so you can serve people earlier, prepare them for your larger offers and spend less time repeating the same work.</p>
  </div></section>
  <div class="screen wide">
    ${errorMsg ? `<div class="msg err">${errorMsg}</div>` : ''}
    <div class="steps-row">
      <div class="step-card"><div class="n">1</div><h3>Answer focused questions</h3><p>About the business you already run: your signature offer, how you work with customers and what you have already made.</p></div>
      <div class="step-card"><div class="n">2</div><h3>Get your Authority Funnel Map</h3><p>One to five digital products in a funnel that leads buyers toward your signature offer, built from what you already have.</p></div>
      <div class="step-card"><div class="n">3</div><h3>Edit, price and test</h3><p>Adjust anything, choose prices from realistic ranges, and run one simple test before you build.</p></div>
    </div>
    <div class="cta-row"><button class="btn big" type="button" data-ui="example">See an example map</button></div>
    ${resendForm()}
  </div>`;
}

function renderIntro() {
  unmountMap();
  const name = S.buyer?.firstName ? `, ${esc(S.buyer.firstName)}` : '';
  app.innerHTML = `${topbar()}
  <div class="screen">
    <div class="card">
      <h2>Welcome${name}. Let’s find the products already in your business.</h2>
      <p>You will answer ${QUESTIONS.length} short questions in five stages. Most people finish in 15 to 25 minutes. Your answers save as you go, so you can stop and come back from any device using the link in your email.</p>
      <p>At the end you get your <b>Authority Funnel Map</b>: up to five digital products, each solving one specific problem and moving buyers one step closer to your signature offer. You can edit everything.</p>
      <ul class="small-print" style="padding-left:18px;margin:12px 0 0">
        <li>This works best for an established business with paying customers.</li>
        <li>The AI suggests ideas from your answers and marks what is still an assumption. It never promises sales or income.</li>
        <li>Your answers are private, kept for ${CONFIG.retentionMonths} months after your last visit, and you can delete them at any time.</li>
      </ul>
      <div class="cta-row"><button class="btn solid big" type="button" data-ui="start">Start with stage 1</button></div>
    </div>
  </div>`;
}

function progressBar(q) {
  const cur = STAGES.findIndex((s) => s.id === q.stage);
  const n = QUESTIONS.indexOf(q) + 1;
  return `<div class="progress" aria-label="Progress">
    <div class="stage-dots">${STAGES.map((s, i) => `<div class="stage-dot ${i < cur ? 'done' : i === cur ? 'now' : ''}"><i></i><span>${s.n}. ${esc(s.label)}</span></div>`).join('')}</div>
    <div class="qcount"><span>Stage ${STAGES[cur].n} of 5: ${esc(STAGES[cur].label)}</span><span>Question ${n} of ${QUESTIONS.length}</span></div>
  </div>`;
}

function renderInterview({ focus = 'answer' } = {}) {
  unmountMap();
  const i = Math.min(S.progress.index, QUESTIONS.length - 1);
  const q = QUESTIONS[i];
  const a = S.answers[q.id] || {};
  const stage = STAGES.find((s) => s.id === q.stage);
  const firstOfStage = QUESTIONS.findIndex((x) => x.stage === q.stage) === i;
  const tailored = (S.tailored[q.id] || []).filter(Boolean);
  const examples = tailored.length ? tailored : q.examples;
  const fu = S.fuOpen[q.id] && a.followUpQuestion;
  app.innerHTML = `${topbar()}
  <div class="screen">
    ${progressBar(q)}
    <section class="card qcard" aria-labelledby="qh">
      ${S.ack[q.id] && !S.returnToReview ? `<div class="ack">${esc(S.ack[q.id])}</div>` : ''}
      ${firstOfStage ? `<div class="stage-intro">${esc(stage.intro)}</div>` : ''}
      <div class="stage-label">Stage ${stage.n}: ${esc(stage.label)}</div>
      <h2 id="qh">${esc(q.prompt)}${q.optional ? '<span class="optional-tag">Optional</span>' : ''}</h2>
      <p class="help">${esc(q.help)}</p>
      <label class="sr" for="answer">Your answer</label>
      <textarea id="answer" maxlength="${LIMITS_INTERVIEW.answer}" data-ui-input="answer" placeholder="Type your answer here">${esc(a.answer || '')}</textarea>
      <div class="count"><span id="ansCount">${(a.answer || '').length}</span> / ${LIMITS_INTERVIEW.answer}</div>
      <details class="examples" ${(a.answer || '').trim() ? '' : 'open'}>
        <summary>Examples${tailored.length ? '<span class="tailored">For a business like yours</span>' : ''}</summary>
        <ul>${examples.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </details>
      ${fu ? `<div class="followup" aria-labelledby="fuh">
        <div class="fu-label">One more detail</div>
        <h3 id="fuh">${esc(a.followUpQuestion)}</h3>
        <label class="sr" for="fu">Your answer to the follow-up</label>
        <textarea id="fu" maxlength="${LIMITS_INTERVIEW.followUp}" data-ui-input="fu" placeholder="A sentence or two is enough">${esc(a.followUpAnswer || '')}</textarea>
        ${(a.followUpExamples || []).length ? `<details class="examples"><summary>Examples</summary><ul>${a.followUpExamples.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      </div>` : ''}
      ${S.note ? `<div class="msg" role="status">${S.note}</div>` : ''}
      <div class="q-actions">
        <button class="btn quiet" type="button" data-ui="back" ${i === 0 && !S.returnToReview ? 'disabled' : ''}>${S.returnToReview ? 'Back to review' : 'Back'}</button>
        <div class="right">
          ${S.thinking ? '<span class="thinking">Reading your answer…</span>' : ''}
          ${fu ? '<button class="btn quiet" type="button" data-ui="skipfu">Skip this detail</button>' : `<button class="btn quiet" type="button" data-ui="skip">Skip</button>`}
          <button class="btn solid" type="button" data-ui="next" ${S.thinking ? 'disabled' : ''}>${S.returnToReview && !fu ? 'Save and return' : i === QUESTIONS.length - 1 && !fu ? 'Review my answers' : 'Continue'}</button>
        </div>
      </div>
    </section>
    <p class="small-print">Saved automatically. You can leave and come back with the link in your email.</p>
  </div>`;
  const el = $(focus === 'fu' ? '#fu' : '#answer');
  if (el && !S.thinking) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
}

function renderReview(message = '') {
  unmountMap();
  const ready = readyToMap(S.answers);
  const missing = ESSENTIAL.filter((id) => !(S.answers[id]?.answer || '').trim()).map((id) => QUESTIONS.find((q) => q.id === id));
  app.innerHTML = `${topbar()}
  <div class="screen">
    <div class="card">
      <h2>Review your answers</h2>
      <p>Change anything before you create your map. Better detail gives better product ideas.</p>
      ${STAGES.map((s) => `<div class="review-stage"><h3>Stage ${s.n}: ${esc(s.label)}</h3>
        ${QUESTIONS.filter((q) => q.stage === s.id).map((q) => {
          const a = S.answers[q.id] || {};
          const text = [a.answer, a.followUpAnswer ? `${a.followUpQuestion}\n${a.followUpAnswer}` : ''].filter((x) => (x || '').trim()).join('\n\n');
          return `<div class="review-item"><div class="rq">${esc(q.prompt)}</div><div class="ra ${text ? '' : 'empty'}">${text ? esc(text) : (q.optional ? 'Skipped (optional)' : 'Not answered yet')}</div>
            <button class="btn small" type="button" data-ui="edit" data-q="${QUESTIONS.indexOf(q)}">${text ? 'Edit' : 'Answer'}</button></div>`;
        }).join('')}</div>`).join('')}
      <div class="goal-pick">
        <h3 style="font-size:0.95rem;color:var(--teal-deep)">Your goal per sale</h3>
        <p>Roughly what you would like each buyer to spend on average across your funnel. You can change it later.</p>
        <div class="goal" role="radiogroup" aria-label="Goal per sale">${AOV_GOALS.map((g) => `<button type="button" role="radio" aria-checked="${g === S.progress.goal}" class="goal-chip ${g === S.progress.goal ? 'on' : ''}" data-ui="goal" data-value="${g}">$${g}</button>`).join('')}</div>
      </div>
      ${message ? `<div class="msg err" role="alert">${message}</div>` : ''}
      ${!ready ? `<div class="msg">To create your map, answer ${missing.length ? missing.map((q) => `"${esc(q.prompt)}"`).join(', ') : 'at least six questions'}${missing.length ? '' : ''}.</div>` : ''}
      ${S.confirmFresh ? `<div class="msg">Creating a fresh map replaces your current map and any edits you made to it. <div class="cta-row" style="margin-top:8px"><button class="btn solid small" type="button" data-ui="generate-confirm">Replace my map</button><button class="btn small" type="button" data-ui="cancel-fresh">Keep my current map</button></div></div>` : ''}
      <div class="cta-row">
        <button class="btn solid big" type="button" data-ui="generate" ${ready ? '' : 'disabled'}>${S.map ? 'Create a fresh map' : 'Create my Authority Funnel Map'}</button>
        ${S.map ? '<button class="btn big" type="button" data-ui="tomap">Back to my map</button>' : ''}
      </div>
    </div>
  </div>`;
}

const PHASES = ['Reading your answers', 'Finding what you already have', 'Matching problems to products', 'Placing products in your funnel', 'Checking prices against common ranges', 'Marking what is still an assumption', 'Choosing what to test first'];
let phaseTimer;
function renderGenerating() {
  unmountMap();
  app.innerHTML = `${topbar()}<div class="screen"><div class="card generating" role="status">
    <div class="ring" aria-hidden="true"></div>
    <h2>Building your Authority Funnel Map</h2>
    <p class="phase" id="phase">${PHASES[0]}…</p>
    <p class="small-print">This usually takes 30 to 90 seconds. Please keep this page open.</p>
  </div></div>`;
  let n = 0;
  clearInterval(phaseTimer);
  phaseTimer = setInterval(() => { n = Math.min(n + 1, PHASES.length - 1); const el = $('#phase'); if (el) el.textContent = `${PHASES[n]}…`; }, 9000);
}

function nextStepsHtml() {
  const card = (cls, title, text, url, label) => `<div class="ns ${cls}"><h3>${title}</h3><p>${text}</p>${url ? `<a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : ''}</div>`;
  return `<section class="panel next-steps" aria-labelledby="ns-h">
    <div class="eyebrow">Your next step</div>
    <h2 id="ns-h">Turn this map into a working funnel</h2>
    <div class="grid3">
      ${card('primary', 'Have it built for you', `${esc(CONFIG.brand)} can build your funnel pages, workflows and the emails that invite buyers to your signature offer, in HighLevel.`, CONFIG.bookingUrl, 'Book a call')}
      ${card('', 'Build the products yourself', 'The Low-Ticket Authority Funnel course walks you through creating, structuring and connecting these products.', CONFIG.courseUrl, 'See the course')}
      ${card('', 'Model your numbers', 'The Authority Funnel Revenue Calculator shows what traffic, take rates and prices could mean for your funnel.', CONFIG.calculatorUrl, 'See the calculator')}
    </div>
    ${CONFIG.bookingUrl ? '' : '<p class="note">To book a call, reply to your purchase email.</p>'}
    ${S.sharedAt ? '' : '<p class="note">Booking a call? Use "Send to Priddy Impact Group" above first, so we can look at your map before we talk.</p>'}
  </section>`;
}

function footerHtml() {
  return `<div class="foot-row">
    <span>Your map and answers are private to you and kept for ${CONFIG.retentionMonths} months after your last visit.${CONFIG.supportEmail ? ` Questions: <a href="mailto:${esc(CONFIG.supportEmail)}">${esc(CONFIG.supportEmail)}</a>` : ''}</span>
    <span>Authority Funnel Map v${APP_VERSION} <button type="button" class="linklike" data-app="delete">Delete my data</button></span>
  </div>
  ${S.showDelete ? `<div class="danger-zone" role="alert">This permanently deletes your answers and map. Your link will stop working. Type DELETE to confirm:
    <label class="sr" for="delConfirm">Type DELETE</label><input id="delConfirm" autocomplete="off">
    <button type="button" class="btn small danger" data-app="delete-confirm">Delete everything</button>
    <button type="button" class="btn small" data-app="delete-cancel">Cancel</button></div>` : ''}`;
}

function renderMapScreen() {
  const tools = `<div class="app-tools">
    <button type="button" class="btn small" data-app="answers">Edit answers</button>
    <button type="button" class="btn small" data-app="pdf">Download PDF</button>
    <button type="button" class="btn small" data-app="png">Download image</button>
    <button type="button" class="btn small ${S.sharedAt ? '' : 'solid'}" data-app="share">${S.sharedAt ? 'Sent to Priddy Impact Group ✓' : 'Send to Priddy Impact Group'}</button>
  </div>`;
  const missing = S.missingInfo ? `<div class="missing"><b>To make this map sharper:</b> ${esc(S.missingInfo)} You can add it under Edit answers and create a fresh map.</div>` : '';
  mountMap(S.map, {
    root: app,
    onChange: (m) => { S.map = m; queueSave({ map: m }); },
    onAction,
    toolsHtml: tools,
    ctaHtml: missing + nextStepsHtml(),
    footerHtml: footerHtml(),
    savedText: 'Saved',
  });
}

function renderShared(map) {
  mountMap(map, {
    root: app,
    readOnly: true,
    toolsHtml: '<span class="note" style="margin:0">Shared map, read only</span> <button type="button" class="btn small" data-app="pdf">Download PDF</button>',
    footerHtml: `<div class="foot-row"><span>Authority Funnel Map v${APP_VERSION}</span></div>`,
    onAction,
  });
}

function renderExample() {
  mountMap(EXAMPLE_MAP, {
    root: app,
    readOnly: true,
    toolsHtml: '<button type="button" class="btn small" data-app="back-welcome">Back</button>',
    footerHtml: `<div class="foot-row"><span>Example map for a fictional business. Your map is built from your own answers.</span><span>v${APP_VERSION}</span></div>`,
    onAction,
  });
  window.scrollTo({ top: 0 });
}

function renderGoodbye() {
  unmountMap();
  app.innerHTML = `${topbar()}<div class="screen"><div class="card"><h2>Your data has been deleted</h2><p>Your answers and map are gone and your link no longer works. Thank you for using the Authority Funnel Map.</p></div></div>`;
}

function render() {
  if (S.progress.phase === 'map' && S.map) return renderMapScreen();
  if (S.progress.phase === 'review') return renderReview();
  if (S.progress.phase === 'interview') return renderInterview();
  return renderIntro();
}

/* ---------- Interview logic ---------- */
function currentQ() { return QUESTIONS[Math.min(S.progress.index, QUESTIONS.length - 1)]; }
function answerOf(q) { return (S.answers[q.id] ||= { answer: '', followUpQuestion: '', followUpAnswer: '', followUpExamples: [], skipped: false, checked: false }); }

function advance() {
  S.note = '';
  if (S.returnToReview) { S.returnToReview = false; S.progress.phase = 'review'; }
  else if (S.progress.index >= QUESTIONS.length - 1) { S.progress.phase = 'review'; }
  else { S.progress.index += 1; }
  queueSave({ answers: S.answers, progress: S.progress });
  render();
  window.scrollTo({ top: 0 });
}

async function onNext() {
  const q = currentQ();
  const a = answerOf(q);
  a.answer = ($('#answer')?.value || '').trim();
  if ($('#fu')) a.followUpAnswer = $('#fu').value.trim();
  if (!a.answer) {
    if (q.optional) { a.skipped = true; return advance(); }
    S.note = 'Add a short answer, or choose Skip to come back to it later.';
    return renderInterview();
  }
  a.skipped = false;
  if (S.fuOpen[q.id]) { S.fuOpen[q.id] = false; return advance(); }
  if (a.checked) return advance();

  S.thinking = true; S.note = '';
  renderInterview();
  try {
    const r = await api('/api/ai', { method: 'POST', body: { step: 'followup', payload: { answers: S.answers, questionId: q.id, goal: S.progress.goal } } });
    const d = r.data;
    a.checked = true;
    const next = QUESTIONS[QUESTIONS.indexOf(q) + 1];
    if (next) { S.tailored[next.id] = d.next_examples; S.ack[next.id] = d.acknowledgement; }
    if (d.needs_follow_up && !a.followUpQuestion) {
      Object.assign(a, { followUpQuestion: d.follow_up_question, followUpExamples: d.follow_up_examples, followUpAnswer: '' });
      S.fuOpen[q.id] = true;
      S.thinking = false;
      queueSave({ answers: S.answers });
      return renderInterview({ focus: 'fu' });
    }
  } catch (e) {
    if (e.status === 401) { S.thinking = false; return renderWelcome(errText(e)); }
    // AI help is a bonus: never block the interview on it.
    a.checked = e.status === 429;
  }
  S.thinking = false;
  advance();
}

async function generate() {
  S.confirmFresh = false;
  await flushNow();
  renderGenerating();
  try {
    const r = await api('/api/ai', { method: 'POST', body: { step: 'map', payload: { answers: S.answers, goal: S.progress.goal } } });
    S.map = r.data.map;
    S.missingInfo = r.data.missingInfo || '';
    S.progress.phase = 'map';
    clearInterval(phaseTimer);
    queueSave({ map: S.map, progress: S.progress }, { now: true });
    renderMapScreen();
    window.scrollTo({ top: 0 });
    showToast('Your map is ready. Everything on it can be edited.');
  } catch (e) {
    clearInterval(phaseTimer);
    if (e.status === 401) return renderWelcome(errText(e));
    S.progress.phase = 'review';
    renderReview(`${errText(e)} Your answers are saved${e.status === 429 ? '.' : '. You can try again now.'}`);
  }
}
async function flushNow() { clearTimeout(saveTimer); await flush(); }

/* ---------- Map actions ---------- */
async function onAction(name) {
  if (name === 'back-welcome') return renderWelcome();
  if (name === 'answers') { S.progress.phase = 'review'; queueSave({ progress: S.progress }); renderReview(); return window.scrollTo({ top: 0 }); }
  if (name === 'pdf') return window.print();
  if (name === 'png') return exportPng();
  if (name === 'share') {
    try {
      if (S.sharedAt) {
        await api('/api/share', { method: 'DELETE' });
        S.sharedAt = null;
        renderMapScreen();
        return showToast('Sharing stopped. The old view link no longer works.');
      }
      await flushNow();
      await api('/api/share', { method: 'POST', body: {} });
      S.sharedAt = new Date().toISOString();
      renderMapScreen();
      return showToast(`Sent. ${CONFIG.brand} can now see your map.`);
    } catch (e) { return showToast(e.message); }
  }
  if (name === 'delete') { S.showDelete = true; renderMapScreen(); return $('#delConfirm')?.focus(); }
  if (name === 'delete-cancel') { S.showDelete = false; return renderMapScreen(); }
  if (name === 'delete-confirm') {
    if (($('#delConfirm')?.value || '').trim() !== 'DELETE') return showToast('Type DELETE in capitals to confirm.');
    try {
      await api('/api/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
      ls.del(backupKey()); ls.del(TOKEN_KEY);
      queued = {}; S.token = '';
      return renderGoodbye();
    } catch (e) { return showToast(e.message); }
  }
  return undefined;
}

async function exportPng() {
  showToast('Preparing your image…');
  const node = app;
  node.classList.add('exporting');
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm');
    const skip = (el) => !(el.classList && (el.classList.contains('app-tools') || el.classList.contains('tools') || el.classList.contains('danger-zone')));
    const url = await mod.toPng(node, { pixelRatio: 2, backgroundColor: '#F6F0E4', filter: skip, cacheBust: true });
    const a = document.createElement('a');
    const name = (currentMap()?.business?.name || 'my-business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
    a.href = url; a.download = `authority-funnel-map-${name}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast('Image downloaded.');
  } catch {
    showToast('The image could not be made in this browser. Use Download PDF instead.');
  } finally {
    node.classList.remove('exporting');
  }
}

/* ---------- Events ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-ui]');
  if (!t) return;
  const ui = t.dataset.ui;
  if (ui === 'example') return renderExample();
  if (ui === 'start') { S.progress.phase = 'interview'; S.progress.index = 0; queueSave({ progress: S.progress }); return renderInterview(); }
  if (ui === 'next') return onNext();
  if (ui === 'skip') {
    const q = currentQ(); const a = answerOf(q);
    a.answer = ($('#answer')?.value || '').trim(); a.skipped = !a.answer;
    return advance();
  }
  if (ui === 'skipfu') { const q = currentQ(); S.fuOpen[q.id] = false; answerOf(q).followUpAnswer = ''; return advance(); }
  if (ui === 'back') {
    S.note = '';
    const q = currentQ(); const a = answerOf(q); a.answer = ($('#answer')?.value || a.answer || '').trim();
    if (S.returnToReview) { S.returnToReview = false; S.progress.phase = 'review'; queueSave({ answers: S.answers, progress: S.progress }); return renderReview(); }
    S.progress.index = Math.max(0, S.progress.index - 1);
    queueSave({ answers: S.answers, progress: S.progress });
    return renderInterview();
  }
  if (ui === 'edit') {
    S.progress.index = +t.dataset.q; S.progress.phase = 'interview'; S.returnToReview = true;
    const q = currentQ(); if (S.answers[q.id]?.followUpQuestion) S.fuOpen[q.id] = true;
    queueSave({ progress: S.progress });
    renderInterview(); return window.scrollTo({ top: 0 });
  }
  if (ui === 'goal') { S.progress.goal = +t.dataset.value; if (S.map) S.map.goal = S.progress.goal; queueSave({ progress: S.progress, ...(S.map ? { map: S.map } : {}) }); return renderReview(); }
  if (ui === 'generate') { if (S.map) { S.confirmFresh = true; return renderReview(); } return generate(); }
  if (ui === 'generate-confirm') return generate();
  if (ui === 'cancel-fresh') { S.confirmFresh = false; return renderReview(); }
  if (ui === 'tomap') { S.progress.phase = 'map'; queueSave({ progress: S.progress }); renderMapScreen(); return window.scrollTo({ top: 0 }); }
  return undefined;
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset.uiInput) return;
  const q = currentQ(); const a = answerOf(q);
  if (t.dataset.uiInput === 'answer') {
    if (a.answer !== t.value.trim()) a.checked = false;
    a.answer = t.value;
    const c = $('#ansCount'); if (c) c.textContent = t.value.length;
  } else {
    a.followUpAnswer = t.value;
  }
  queueSave({ answers: S.answers });
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target.dataset?.uiInput) { e.preventDefault(); onNext(); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-ui-form="resend"]');
  if (!f) return;
  e.preventDefault();
  const out = $('#resendMsg');
  try {
    const r = await api('/api/resend', { method: 'POST', body: { email: $('#resendEmail').value } });
    out.innerHTML = `<div class="msg ok" role="status">${esc(r.message)}</div>`;
  } catch (err) {
    out.innerHTML = `<div class="msg err" role="alert">${errText(err)}</div>`;
  }
});

/* ---------- Start ---------- */
async function boot() {
  const view = params.get('view');
  if (view) {
    app.innerHTML = `${topbar()}<div class="screen"><p class="thinking">Opening the shared map…</p></div>`;
    try {
      const r = await api(`/api/me?view=${encodeURIComponent(view)}`);
      return renderShared(r.map);
    } catch (e) {
      return renderWelcome(errText(e));
    }
  }

  // A link from the email (?t=) is moved out of the address bar and remembered in this browser.
  const fromUrl = params.get('t');
  if (fromUrl) {
    S.token = fromUrl.trim();
    ls.set(TOKEN_KEY, S.token);
    params.delete('t');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
  } else if (params.has('demo')) {
    try {
      const r = await api('/api/me?demo=1');
      S.token = r.token; ls.set(TOKEN_KEY, S.token);
      history.replaceState(null, '', location.pathname);
    } catch { /* demo not available here */ }
  } else {
    S.token = ls.get(TOKEN_KEY) || '';
  }
  if (!S.token) return renderWelcome();

  app.innerHTML = `${topbar()}<div class="screen"><p class="thinking">Opening your map…</p></div>`;
  try {
    const r = await api('/api/me');
    S.buyer = r.buyer;
    const st = r.state || {};
    Object.assign(S, { answers: st.answers || {}, map: st.map || null, sharedAt: st.sharedAt || null, updatedAt: st.updatedAt || null });
    S.progress = { index: 0, phase: 'intro', goal: 100, ...(st.progress || {}) };
    // Recover anything this browser has that never reached the server.
    try {
      const b = JSON.parse(ls.get(backupKey()) || 'null');
      if (b && (!S.updatedAt || b.at > S.updatedAt)) {
        Object.assign(S, { answers: b.answers || S.answers, map: b.map || S.map, progress: { ...S.progress, ...(b.progress || {}) } });
        queueSave({ answers: S.answers, progress: S.progress, ...(S.map ? { map: S.map } : {}) });
      }
    } catch { /* ignore damaged backup */ }
    if (S.progress.phase === 'map' && !S.map) S.progress.phase = 'review';
    render();
  } catch (e) {
    if (e.status === 401) { ls.del(TOKEN_KEY); return renderWelcome(errText(e)); }
    app.innerHTML = `${topbar()}<div class="screen"><div class="msg err" role="alert">${errText(e)}</div><div class="cta-row"><button class="btn solid" type="button" onclick="location.reload()">Try again</button></div></div>`;
  }
}

boot();
