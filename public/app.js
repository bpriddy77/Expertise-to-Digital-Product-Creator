/**
 * Expertise-to-Digital-Product Creator — page logic (proof of concept).
 * Everything the customer types stays in this browser (localStorage) unless they
 * download a progress file. The server only forwards text to the AI and never stores it.
 */
import { QUESTIONS, MAX_FOLLOW_UPS_PER_QUESTION } from './shared/questions.js?v=0.1.2';
import { LIMITS, evidenceLevel, EVIDENCE_LEVELS, suggestPrice, riskyPhrases } from './shared/rules.js?v=0.1.2';
import { APP_VERSION, PROMPT_VERSION, DATA_SCHEMA } from './shared/version.js?v=0.1.2';

const $ = (id) => document.getElementById(id);
const view = $('view');
const STORE = 'pig-dp001-project';
const CODE_STORE = 'pig-dp001-access';
const DEBUG = new URLSearchParams(location.search).has('debug');

const STEPS = [
  { key: 'welcome', label: 'Start' },
  { key: 'discover', label: 'Discover' },
  { key: 'strengths', label: 'Your strength' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'ideas', label: 'Product ideas' },
  { key: 'validate', label: 'Market check' },
  { key: 'build', label: 'Build' },
  { key: 'review', label: 'Review & export' },
];

const ENJOY = ['Teaching and explaining', 'Writing', 'Organizing and systems', 'Making templates and tools', 'Research', 'Working one-on-one', 'Speaking or video'];
const AVOID = ['Live calls', 'Being on camera', 'Lots of writing', 'Ongoing customer support', 'Posting on social media daily', 'Complicated tech setup'];
const HOURS = ['Under 2 hours', '2–5 hours', '5–10 hours', '10+ hours'];
const INVOLVEMENT = ['Hands-off: sell it and let it run', 'Some live touchpoints are fine', 'I enjoy working with people directly'];

/* ---------- State ---------- */

const blank = () => ({
  schema: DATA_SCHEMA,
  appVersion: APP_VERSION,
  promptVersion: PROMPT_VERSION,
  createdAt: new Date().toISOString(),
  step: 'welcome',
  qIndex: 0,
  answers: {},
  strengthList: [],
  thinNote: '',
  rejected: [],
  pick: null,
  correction: '',
  strength: null,
  lifestyle: { enjoy: [], avoid: [], hours: '', involvement: '', notes: '' },
  ideas: [],
  idea: null,
  validation: { comparables: [{}, {}, {}], questions: ['', '', ''], signals: { askedForHelp: '', waitlist: '', presales: '', paidClients: '' } },
  outline: null,
  sections: {},
  previous: {},
  summary: null,
  priceOverride: '',
  author: '',
  usage: { calls: {}, cost: 0, tokensIn: 0, tokensOut: 0, estimated: false },
});

let state = load() || blank();
const ui = { busy: null, error: null, retry: null, server: { mode: 'unknown', accessRequired: false }, writing: new Set() };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    return s && s.schema === DATA_SCHEMA ? { ...blank(), ...s } : null;
  } catch { return null; }
}
let saveTimer;
function save(now = false) {
  clearTimeout(saveTimer);
  const go = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...state, appVersion: APP_VERSION })); } catch { /* storage blocked */ } };
  if (now) go(); else saveTimer = setTimeout(go, 400);
}

/* ---------- Helpers ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => `$${Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 2)}`;
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, v) {
  const keys = path.split('.'); let o = obj;
  keys.slice(0, -1).forEach((k) => { if (o[k] == null) o[k] = /^\d+$/.test(k) ? [] : {}; o = o[k]; });
  o[keys.at(-1)] = v;
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
const answered = (id) => (state.answers[id]?.answer || '').trim() !== '';
const allAnswered = () => QUESTIONS.every((q) => answered(q.id));
const used = (k) => state.usage.calls[k] || 0;
const left = (k) => Math.max(0, LIMITS[k] - used(k));
const sectionsDone = () => state.outline && state.outline.sections.every((s) => state.sections[s.id]?.blocks?.length);

function reachable(key) {
  switch (key) {
    case 'welcome': case 'discover': return true;
    case 'strengths': return allAnswered();
    case 'preferences': case 'ideas': return Boolean(state.strength);
    case 'validate': case 'build': return Boolean(state.idea);
    case 'review': return Boolean(sectionsDone());
    default: return false;
  }
}
function go(key) {
  if (!reachable(key)) return;
  state.step = key; ui.error = null;
  if (key !== 'welcome') state.lastStep = key;
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  autoStart();
}

/* ---------- AI calls ---------- */

const LIMIT_KEY = { followup: 'followups', strengths: 'strengths', ideas: 'ideas', outline: 'outline', section: 'sections', regenerate: 'regenerations', summary: 'summary' };

async function ai(step, payload, { limitKey = LIMIT_KEY[step], busy } = {}) {
  if (limitKey && left(limitKey) <= 0) throw new Error('You have used all the AI requests for this step in this version. You can still edit everything by hand.');
  ui.busy = busy || null; ui.error = null; render();
  try {
    const headers = { 'content-type': 'application/json' };
    const code = localStorage.getItem(CODE_STORE);
    if (code) headers['x-access-code'] = code;
    let res;
    try {
      res = await fetch('api/ai', { method: 'POST', headers, body: JSON.stringify({ step, payload }) });
    } catch {
      throw new Error('Could not connect. Check your internet connection and try again.');
    }
    const j = await res.json().catch(() => ({ ok: false, error: 'Something went wrong. Try again.' }));
    if (res.status === 401) {
      // Code missing or changed: send them back to the welcome screen to enter it.
      localStorage.removeItem(CODE_STORE); ui.server.accessRequired = true;
      state.step = 'welcome'; save();
    }
    if (!j.ok) throw new Error(`${j.error || 'Something went wrong. Try again.'}${DEBUG && j.detail ? ` Setup detail: ${j.detail}` : ''}`);
    if (limitKey) state.usage.calls[limitKey] = used(limitKey) + 1;
    const u = j.usage || {};
    state.usage.cost += u.cost || 0;
    state.usage.tokensIn += u.input_tokens || 0;
    state.usage.tokensOut += u.output_tokens || 0;
    state.usage.estimated = state.usage.estimated || Boolean(u.estimated);
    (state.usage.log ||= []).push({ step, model: u.model, in: u.input_tokens, out: u.output_tokens, cost: u.cost });
    state.promptVersion = j.promptVersion || state.promptVersion;
    save();
    return j.data;
  } finally {
    ui.busy = null;
  }
}

/** Checks the access code with the server before letting anyone in. No AI call, no cost. */
async function verifyCode() {
  const code = ($('accessCode')?.value || localStorage.getItem(CODE_STORE) || '').trim();
  if (!code) { ui.error = 'Enter your access code to continue.'; ui.retry = null; render(); return false; }
  try {
    const res = await fetch('api/ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-access-code': code }, body: JSON.stringify({ step: 'verify' }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) {
      try { localStorage.setItem(CODE_STORE, code); } catch { /* storage blocked */ }
      ui.error = null;
      return true;
    }
    try { localStorage.removeItem(CODE_STORE); } catch { /* ignore */ }
    ui.error = j.error || 'That access code doesn\'t match. Check your purchase email and try again.';
  } catch {
    ui.error = 'Could not connect. Check your internet connection and try again.';
  }
  ui.retry = null; render();
  $('accessCode')?.focus();
  return false;
}

async function run(fn, retry) {
  try {
    await fn();
  } catch (e) {
    ui.error = e.message; ui.retry = retry || null;
  }
  render();
}

/* ---------- Step actions ---------- */

async function nextQuestion() {
  const q = QUESTIONS[state.qIndex];
  const a = (state.answers[q.id] ||= {});
  if (!(a.answer || '').trim()) { ui.error = 'Write a few words first. "I\'m not sure" is a fine start, and the next question can help.'; ui.retry = null; render(); return; }
  if (!a.checked && left('followups') > 0 && MAX_FOLLOW_UPS_PER_QUESTION > 0) {
    await run(async () => {
      const d = await ai('followup', { questionId: q.id, answer: a.answer }, { busy: 'Reading your answer…' });
      a.checked = true;
      a.ack = d.acknowledgement;
      a.followUpQuestion = d.needs_follow_up ? d.follow_up_question : '';
      if (!a.followUpQuestion) advanceQuestion();
    }, nextQuestion);
    return;
  }
  advanceQuestion();
}
function advanceQuestion() {
  state.qIndex = Math.min(QUESTIONS.length, state.qIndex + 1);
  save(); render();
  view.querySelector('textarea')?.focus();
}

async function findStrengths({ different = false } = {}) {
  await run(async () => {
    const d = await ai('strengths', { answers: state.answers, rejected: state.rejected }, { busy: different ? 'Looking for different strengths…' : 'Looking for strengths in what you shared…' });
    state.strengthList = d.strengths;
    state.thinNote = d.thin_evidence_note;
    state.pick = null; state.correction = '';
  }, () => findStrengths({ different }));
}

async function findIdeas() {
  await run(async () => {
    const d = await ai('ideas', { strength: state.strength, lifestyle: state.lifestyle, answers: state.answers }, { busy: 'Shaping workbook ideas around your strength…' });
    state.ideas = d.ideas;
  }, findIdeas);
}

async function makeOutline() {
  await run(async () => {
    const d = await ai('outline', { strength: state.strength, idea: state.idea, answers: state.answers }, { busy: 'Planning your workbook…' });
    state.outline = d; state.sections = {}; state.previous = {}; state.summary = null;
  }, makeOutline);
}

async function writeSection(id, { instruction = '' } = {}) {
  const regenerate = Boolean(state.sections[id]?.blocks?.length);
  const limitKey = regenerate ? 'regenerations' : 'sections';
  ui.writing.add(id); render();
  try {
    const payload = { strength: state.strength, idea: state.idea, answers: state.answers, outline: state.outline, sectionId: id, instruction };
    if (regenerate) payload.previousText = blocksToText(state.sections[id].blocks);
    const d = await ai('section', payload, { limitKey });
    if (regenerate) state.previous[id] = state.sections[id];
    state.sections[id] = d;
    state.summary = null;
    save();
  } finally {
    ui.writing.delete(id);
  }
}

async function writeAll() {
  await run(async () => {
    for (const s of state.outline.sections) {
      if (!state.sections[s.id]?.blocks?.length) await writeSection(s.id);
      render();
    }
  }, writeAll);
}

async function makeSummary() {
  await run(async () => {
    state.summary = await ai('summary', { strength: state.strength, idea: state.idea, outline: state.outline }, { busy: 'Writing your product description and launch checklist…' });
  }, makeSummary);
}

function autoStart() {
  if (ui.busy || ui.error) return;
  if (state.step === 'strengths' && !state.strengthList.length && left('strengths') === LIMITS.strengths) findStrengths();
  if (state.step === 'ideas' && !state.ideas.length && left('ideas') === LIMITS.ideas) findIdeas();
  if (state.step === 'build' && !state.outline && left('outline') === LIMITS.outline) makeOutline();
  if (state.step === 'review' && !state.summary && left('summary') === LIMITS.summary) makeSummary();
}

/* ---------- Rendering ---------- */

function renderProgress() {
  const i = STEPS.findIndex((s) => s.key === state.step);
  $('progress').innerHTML = `<ol>${STEPS.map((s, n) => `
    <li class="${n < i ? 'done' : ''} ${n === i ? 'current' : ''}">
      <button type="button" data-go="${s.key}" ${reachable(s.key) ? '' : 'disabled'} aria-current="${n === i ? 'step' : 'false'}">
        <span class="bar"></span><span class="lbl">${s.label}</span>
      </button>
    </li>`).join('')}</ol>
    <p class="mobile-label">Step ${i + 1} of ${STEPS.length}: ${STEPS[i].label}</p>`;
}

function renderBanner() {
  $('banner').innerHTML = ui.server.mode === 'mock'
    ? '<div class="banner"><b>Test mode.</b> The AI isn\'t connected, so you\'ll see sample responses. Costs shown are estimates.</div>'
    : '';
}

const busyBox = () => (ui.busy ? `<div class="thinking"><span class="spin" aria-hidden="true"></span>${esc(ui.busy)}</div>` : '');
const errorBox = () => (ui.error ? `<div class="error" role="alert"><span>${esc(ui.error)}</span>${ui.retry ? '<button type="button" class="btn small" data-act="retry">Try again</button>' : ''}</div>` : '');
const leftNote = (k) => `<span class="left-count">${left(k)} of ${LIMITS[k]} left</span>`;

const VIEWS = {
  welcome() {
    const started = Object.keys(state.answers).length > 0;
    const needCode = ui.server.accessRequired && !localStorage.getItem(CODE_STORE);
    return `<section class="card">
      <p class="eyebrow-step">${started ? 'Welcome back' : 'Let\'s begin'}</p>
      <h2>${started ? 'Pick up where you left off' : 'Turn what you know into your first digital product'}</h2>
      <p class="lead">You'll answer a few questions about your real experience. Then we'll find a strength you're good at <i>and</i> enjoy, shape it into a workbook idea, and write the first version with you. Plan on about 30–45 minutes. Your progress saves as you go.</p>
      <ol class="small" style="margin:0 0 18px;padding-left:20px;line-height:1.9">
        <li>Answer 5 questions about your experience</li>
        <li>Confirm the strength that fits you best</li>
        <li>Tell us how you want your business to feel</li>
        <li>Choose a workbook idea and check the market</li>
        <li>Build, edit and download your workbook</li>
      </ol>
      <p class="note-box">Your answers stay in this browser. They're sent to the AI only to create your suggestions and aren't saved by this tool. Nothing is invented about you: every suggestion points back to your own words.</p>
      ${needCode ? `<div class="field" style="margin-top:18px"><label for="accessCode">Access code</label><input class="input" id="accessCode" autocomplete="off" placeholder="Enter the code from your purchase email"></div>` : ''}
      ${errorBox()}
      <div class="actions">
        <button type="button" class="btn primary" data-act="start">${started ? 'Continue' : 'Start'}</button>
        ${started ? '<span class="spacer"></span><button type="button" class="btn quiet" data-act="reset">Start over</button>' : ''}
      </div>
    </section>`;
  },

  discover() {
    if (state.qIndex >= QUESTIONS.length) {
      return `<section class="card">
        <p class="eyebrow-step">Discover</p>
        <h2>Nice work. Here's what you shared.</h2>
        <p class="lead">Read it over and add anything that comes to mind. More real examples lead to better suggestions.</p>
        <div class="answers-review">${QUESTIONS.map((q, n) => `<button type="button" data-q="${n}"><b>${esc(q.text)}</b>${esc(state.answers[q.id]?.answer || '')}${state.answers[q.id]?.followUpAnswer ? ` ${esc(state.answers[q.id].followUpAnswer)}` : ''}</button>`).join('')}</div>
        <div class="actions"><button type="button" class="btn primary" data-go="strengths" ${allAnswered() ? '' : 'disabled'}>Find my strengths</button></div>
      </section>`;
    }
    const q = QUESTIONS[state.qIndex];
    const a = state.answers[q.id] || {};
    return `<section class="card">
      <p class="q-count">Question ${state.qIndex + 1} of ${QUESTIONS.length}</p>
      <p class="q-text" id="qText">${esc(q.text)}</p>
      <p class="q-hint">${esc(q.hint)}</p>
      <details class="example"><summary>See an example answer</summary><p>${esc(q.example)}</p></details>
      <textarea class="input" data-bind="answers.${q.id}.answer" aria-labelledby="qText" placeholder="Write it the way you'd tell a friend.">${esc(a.answer || '')}</textarea>
      ${a.ack ? `<p class="ack">${esc(a.ack)}</p>` : ''}
      ${a.followUpQuestion ? `<div class="followup">
        <p class="q-text" id="fqText">${esc(a.followUpQuestion)}</p>
        <textarea class="input" data-bind="answers.${q.id}.followUpAnswer" aria-labelledby="fqText" placeholder="Optional, but it helps.">${esc(a.followUpAnswer || '')}</textarea>
      </div>` : ''}
      ${busyBox()}${errorBox()}
      <div class="actions">
        ${state.qIndex > 0 ? '<button type="button" class="btn quiet" data-act="prevQ">Back</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-act="nextQ" ${ui.busy ? 'disabled' : ''}>${a.followUpQuestion ? 'Continue' : 'Next'}</button>
      </div>
    </section>`;
  },

  strengths() {
    const KIND = { demonstrated: 'Shown in what you\'ve done', interest: 'Something you enjoy', mixed: 'Done it and enjoy it' };
    const rejectedNames = new Set(state.rejected.map((r) => r.name));
    const cards = state.strengthList.map((s, n) => {
      const rej = rejectedNames.has(s.name);
      const sel = state.pick === n;
      const r = state.rejected.find((x) => x.name === s.name);
      return `<article class="choice ${sel ? 'selected' : ''} ${rej ? 'rejected' : ''}">
        <h3>${esc(s.name)}</h3>
        <div class="badges"><span class="badge">${KIND[s.kind]}</span>${s.enjoyment === 'high' ? '<span class="badge gold">You seem to enjoy this</span>' : ''}</div>
        <p style="margin:0">${esc(s.summary)}</p>
        <ul class="quotes" aria-label="In your words">${s.evidence.map((e) => `<li>"${esc(e.quote)}"</li>`).join('')}</ul>
        <dl class="kv"><dt>Could help</dt><dd>${esc(s.who_it_could_help)}</dd></dl>
        ${rej ? `<div class="field" style="margin:12px 0 0"><label for="rr${n}">Why isn't this you? <span class="sub">(optional, helps the next suggestions)</span></label>
            <input class="input" id="rr${n}" data-reject-reason="${esc(s.name)}" value="${esc(r?.reason || '')}"></div>
            <div class="actions"><button type="button" class="btn small quiet" data-unreject="${esc(s.name)}">Undo</button></div>`
          : sel ? `<div class="field" style="margin:14px 0 0"><label for="corr">Want to put it in your own words? <span class="sub">(optional)</span></label>
            <textarea class="input" id="corr" data-bind="correction" style="min-height:80px" placeholder="For example: It's less about cooking and more about planning on a budget.">${esc(state.correction)}</textarea></div>
            <div class="actions"><button type="button" class="btn primary" data-act="confirmStrength">Use this strength</button><button type="button" class="btn quiet small" data-pick="">Choose a different one</button></div>`
          : `<div class="actions"><button type="button" class="btn small primary" data-pick="${n}">This is me</button><button type="button" class="btn small" data-reject="${esc(s.name)}">Not me</button></div>`}
      </article>`;
    }).join('');
    return `<section class="card">
      <p class="eyebrow-step">Your strength</p>
      <h2>Here's what stands out in your answers</h2>
      <p class="lead">Each suggestion comes with your own words as evidence. Choose the one that fits best, put it in your own words, or turn down any that aren't you.</p>
      ${state.strength ? `<p class="note-box">Current choice: <b>${esc(state.strength.name)}</b>. Choosing another will reset your product ideas.</p>` : ''}
      ${busyBox()}${errorBox()}
      ${state.thinNote ? `<div class="note-box">${esc(state.thinNote)} <button type="button" class="btn small" data-go="discover" style="margin-left:6px">Add to my answers</button></div>` : ''}
      <div class="choices">${cards}</div>
      ${!ui.busy && state.strengthList.length === 0 && !ui.error && used('strengths') > 0 ? '<p class="note-box">No strong matches yet. Adding a specific example or two to your answers usually helps.</p>' : ''}
      <div class="actions">
        <button type="button" class="btn" data-act="differentStrengths" ${ui.busy || left('strengths') === 0 ? 'disabled' : ''}>Suggest different strengths</button>${leftNote('strengths')}
        <span class="spacer"></span>
        ${state.strength ? '<button type="button" class="btn primary" data-go="preferences">Next</button>' : ''}
      </div>
    </section>`;
  },

  preferences() {
    const L = state.lifestyle;
    const chips = (list, field, cls = '', single = false) => `<div class="chips" role="group">${list.map((x) => {
      const on = single ? L[field] === x : L[field].includes(x);
      return `<button type="button" class="chip ${cls}" aria-pressed="${on}" data-chip="${field}" data-single="${single}" data-v="${esc(x)}">${esc(x)}</button>`;
    }).join('')}</div>`;
    return `<section class="card">
      <p class="eyebrow-step">Preferences</p>
      <h2>How do you want your business to feel?</h2>
      <p class="lead">A product only helps if you enjoy running it. Your ideas will steer around anything you want to avoid.</p>
      <fieldset class="group"><legend>Work you enjoy</legend>${chips(ENJOY, 'enjoy')}</fieldset>
      <fieldset class="group"><legend>Things you'd rather avoid</legend>${chips(AVOID, 'avoid', 'avoid')}</fieldset>
      <fieldset class="group"><legend>Time you can give it each week</legend>${chips(HOURS, 'hours', '', true)}</fieldset>
      <fieldset class="group"><legend>How involved do you want to be?</legend>${chips(INVOLVEMENT, 'involvement', '', true)}</fieldset>
      <div class="field"><label for="ln">Anything else? <span class="sub">(optional)</span></label><input class="input" id="ln" data-bind="lifestyle.notes" value="${esc(L.notes)}" placeholder="For example: I work full time and want weekends free."></div>
      <div class="actions"><button type="button" class="btn quiet" data-go="strengths">Back</button><span class="spacer"></span><button type="button" class="btn primary" data-go="ideas">See product ideas</button></div>
    </section>`;
  },

  ideas() {
    const sel = state.idea;
    const cards = state.ideas.map((i, n) => `<article class="choice ${sel && sel.sourceIndex === n ? 'selected' : ''}">
      <h3>${esc(i.title)}</h3>
      <div class="badges"><span class="badge">Workbook</span></div>
      <dl class="kv">
        <dt>For</dt><dd>${esc(i.audience)}</dd>
        <dt>Their problem</dt><dd>${esc(i.problem)}</dd>
        <dt>Their result</dt><dd>${esc(i.transformation)}</dd>
        <dt>Why it fits you</dt><dd>${esc(i.why_useful)}</dd>
        <dt>Your preferences</dt><dd>${esc(i.lifestyle_fit)}</dd>
      </dl>
      ${i.what_to_validate.length ? `<div class="note-box"><b>Still to check:</b><ul style="margin:4px 0 0;padding-left:18px">${i.what_to_validate.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="actions"><button type="button" class="btn small ${sel && sel.sourceIndex === n ? 'primary' : ''}" data-idea="${n}">${sel && sel.sourceIndex === n ? 'Chosen' : 'Build this one'}</button></div>
    </article>`).join('');
    const edit = sel ? `<div class="card" style="margin-top:18px">
      <h3>Make it yours</h3>
      <p class="small" style="margin:0 0 14px">Adjust the wording before we build. Your workbook will follow this.</p>
      <div class="field"><label for="it">Working title</label><input class="input" id="it" data-bind="idea.title" value="${esc(sel.title)}"></div>
      <div class="field"><label for="ia">Who it's for</label><input class="input" id="ia" data-bind="idea.audience" value="${esc(sel.audience)}"></div>
      <div class="field"><label for="ip">Their problem</label><input class="input" id="ip" data-bind="idea.problem" value="${esc(sel.problem)}"></div>
      <div class="field"><label for="ir">The result they get</label><input class="input" id="ir" data-bind="idea.transformation" value="${esc(sel.transformation)}"></div>
      <div class="actions"><span class="spacer"></span><button type="button" class="btn primary" data-go="validate">Continue to market check</button></div>
    </div>` : '';
    return `<section class="card">
      <p class="eyebrow-step">Product ideas</p>
      <h2>Workbook ideas built on ${esc(state.strength?.name || 'your strength')}</h2>
      <p class="lead">This first version builds workbooks: guided exercises your buyer completes on their own, so there's little to manage once it's done. Pick the idea you'd most like to make.</p>
      ${busyBox()}${errorBox()}
      <div class="choices">${cards}</div>
      <div class="actions"><button type="button" class="btn" data-act="moreIdeas" ${ui.busy || left('ideas') === 0 ? 'disabled' : ''}>Show different ideas</button>${leftNote('ideas')}</div>
    </section>${edit}`;
  },

  validate() {
    const v = state.validation;
    const lvl = evidenceLevel(v);
    const idx = EVIDENCE_LEVELS.findIndex((l) => l.key === lvl.key);
    const price = suggestPrice(v.comparables);
    const q = encodeURIComponent(`${state.strength?.name || ''} workbook`.trim());
    const qp = encodeURIComponent(state.idea?.problem?.replace(/["“”]/g, '') || state.strength?.name || '');
    const link = (href, label) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
    return `<section class="card">
      <p class="eyebrow-step">Market check</p>
      <h2>Do people want this?</h2>
      <p class="lead">Spend 15 minutes looking around. You don't need to finish this before building: many people build a first version to test. Just don't call it a proven seller until you have real evidence.</p>
      <div class="evidence" aria-live="polite">
        <div class="meter" aria-hidden="true">${EVIDENCE_LEVELS.slice(1).map((_, n) => `<i class="${n < idx ? 'on' : ''}"></i>`).join('')}</div>
        <div><b id="evLabel">${esc(lvl.label)}</b><span class="small" id="evDetail">${esc(lvl.detail)}</span></div>
      </div>

      <div class="task">
        <h3>1. Find similar products</h3>
        <p class="small" style="margin:0">Search for workbooks, planners or guides on this topic and note their prices.</p>
        <div class="where">${link(`https://www.etsy.com/search?q=${q}`, 'Etsy')}${link(`https://gumroad.com/discover?query=${q}`, 'Gumroad')}${link(`https://www.amazon.com/s?k=${q}`, 'Amazon')}${link(`https://www.google.com/search?q=${q}`, 'Google')}</div>
        ${v.comparables.map((c, n) => `<div class="row3">
          <div class="field"><label for="cn${n}">Product ${n + 1}</label><input class="input" id="cn${n}" data-bind="validation.comparables.${n}.name" data-live="evidence" value="${esc(c.name || '')}" placeholder="Name"></div>
          <div class="field"><label for="cp${n}">Price</label><input class="input" id="cp${n}" inputmode="decimal" data-bind="validation.comparables.${n}.price" data-live="evidence" value="${esc(c.price || '')}" placeholder="$"></div>
          <div class="field"><label for="cl${n}">Link <span class="sub">(optional)</span></label><input class="input" id="cl${n}" data-bind="validation.comparables.${n}.link" value="${esc(c.link || '')}" placeholder="https://"></div>
        </div>`).join('')}
      </div>

      <div class="task">
        <h3>2. Note questions people ask</h3>
        <p class="small" style="margin:0">Real questions show what your buyers struggle with, and make great workbook content.</p>
        <div class="where">${link(`https://www.reddit.com/search/?q=${qp}`, 'Reddit')}${link(`https://www.quora.com/search?q=${qp}`, 'Quora')}${link(`https://www.youtube.com/results?search_query=${qp}`, 'YouTube comments')}${link(`https://www.google.com/search?q=${qp}`, 'Google "People also ask"')}</div>
        ${v.questions.map((x, n) => `<div class="field"><label for="vq${n}" class="sr">Question ${n + 1}</label><input class="input" id="vq${n}" data-bind="validation.questions.${n}" data-live="evidence" value="${esc(x)}" placeholder="Question ${n + 1}"></div>`).join('')}
      </div>

      <div class="task">
        <h3>3. Count real interest</h3>
        <p class="small" style="margin:0 0 12px">Only count real people, not guesses.</p>
        <div class="row2">
          <div class="field"><label for="s1">People who asked you for help with this</label><input class="input" id="s1" inputmode="numeric" data-bind="validation.signals.askedForHelp" data-live="evidence" value="${esc(v.signals.askedForHelp)}"></div>
          <div class="field"><label for="s2">People on a waitlist or interest list</label><input class="input" id="s2" inputmode="numeric" data-bind="validation.signals.waitlist" data-live="evidence" value="${esc(v.signals.waitlist)}"></div>
          <div class="field"><label for="s3">Pre-orders</label><input class="input" id="s3" inputmode="numeric" data-bind="validation.signals.presales" data-live="evidence" value="${esc(v.signals.presales)}"></div>
          <div class="field"><label for="s4">People who've paid you for this help</label><input class="input" id="s4" inputmode="numeric" data-bind="validation.signals.paidClients" data-live="evidence" value="${esc(v.signals.paidClients)}"></div>
        </div>
      </div>

      <div class="price-box" aria-live="polite"><span class="small">Suggested starting price to test</span><b id="pxVal">${money(price.price)}</b><span class="small" id="pxNote">${esc(price.note)}</span></div>
      <div class="actions"><button type="button" class="btn quiet" data-go="ideas">Back</button><span class="spacer"></span><button type="button" class="btn primary" data-go="build">Build my workbook</button></div>
    </section>`;
  },

  build() {
    const o = state.outline;
    if (!o) {
      return `<section class="card"><p class="eyebrow-step">Build</p><h2>Planning your workbook</h2>${busyBox()}${errorBox()}
        ${!ui.busy ? `<div class="actions"><button type="button" class="btn primary" data-act="outline" ${left('outline') === 0 ? 'disabled' : ''}>Create my outline</button></div>` : ''}</section>`;
    }
    const anyWritten = o.sections.some((s) => state.sections[s.id]?.blocks?.length);
    const KIND = { intro: 'Introduction', exercise: 'Exercise', outcome: 'Wrap-up' };
    return `<section class="card">
      <p class="eyebrow-step">Build</p>
      <h2 contenteditable="true" data-edit="outline.title" spellcheck="true">${esc(o.title)}</h2>
      <p class="lead" contenteditable="true" data-edit="outline.subtitle">${esc(o.subtitle)}</p>
      <h3>Outline</h3>
      <p class="small" style="margin:0 0 10px">Rename any section before writing. You can edit every word afterward, too.</p>
      <ol class="outline-list">${o.sections.map((s, n) => `<li><span class="num">${n + 1}</span><div>
        <span class="kind">${KIND[s.kind]}</span>
        <input aria-label="Section ${n + 1} title" data-bind="outline.sections.${n}.title" value="${esc(s.title)}">
        <small>${esc(s.purpose)}</small></div></li>`).join('')}</ol>
      ${busyBox()}${errorBox()}
      <div class="actions">
        ${!sectionsDone() ? `<button type="button" class="btn primary" data-act="writeAll" ${ui.writing.size ? 'disabled' : ''}>${anyWritten ? 'Write the remaining sections' : 'Write my workbook'}</button>` : ''}
        <button type="button" class="btn quiet small" data-act="newOutline" ${left('outline') === 0 || ui.writing.size ? 'disabled' : ''}>New outline</button>${leftNote('outline')}
      </div>
    </section>
    <div class="doc">${o.sections.map((s) => sectionCard(s)).join('')}</div>
    ${sectionsDone() ? `<div class="actions"><span class="spacer"></span><button type="button" class="btn primary" data-go="review">Review and export</button></div>` : ''}`;
  },

  review() {
    const s = state.summary;
    const price = currentPrice();
    const lvl = evidenceLevel(state.validation);
    const risky = s ? riskyPhrases(`${s.product_title} ${s.short_description} ${s.sales_description}`) : [];
    return `<section class="card">
      <p class="eyebrow-step">Review & export</p>
      <h2>Your product is ready to test</h2>
      <p class="lead">Polish the details, then download your workbook and your product summary.</p>
      ${busyBox()}${errorBox()}
      ${s ? `<div class="review-grid">
        <div class="field"><label for="pt">Product title</label><input class="input" id="pt" data-bind="summary.product_title" data-live="risky" value="${esc(s.product_title)}"></div>
        <div class="field"><label for="sd">Short description</label><textarea class="input" id="sd" style="min-height:70px" data-bind="summary.short_description" data-live="risky">${esc(s.short_description)}</textarea></div>
        <div class="field"><label for="sl">Sales description</label><textarea class="input" id="sl" style="min-height:180px" data-bind="summary.sales_description" data-live="risky">${esc(s.sales_description)}</textarea>
          <div id="riskyWarn">${riskyWarn(risky)}</div></div>
        <div class="row2">
          <div class="field"><label for="wf">Who it's for <span class="sub">(one per line)</span></label><textarea class="input" id="wf" data-lines="summary.who_its_for">${esc(s.who_its_for.join('\n'))}</textarea></div>
          <div class="field"><label for="wg">What they get <span class="sub">(one per line)</span></label><textarea class="input" id="wg" data-lines="summary.what_they_get">${esc(s.what_they_get.join('\n'))}</textarea></div>
        </div>
        <div class="row2">
          <div class="field"><label for="pr">Starting price to test</label><input class="input" id="pr" inputmode="decimal" data-bind="priceOverride" placeholder="${price.suggested}" value="${esc(state.priceOverride)}">
            <small class="small">${esc(price.note)}</small></div>
          <div class="field"><span class="lbl-block">Market evidence so far</span><p style="margin:0"><b>${esc(lvl.label)}</b></p><small class="small">${esc(lvl.detail)}</small></div>
        </div>
        <div class="field"><label for="lc">Launch-readiness checklist <span class="sub">(one per line)</span></label><textarea class="input" id="lc" style="min-height:160px" data-lines="summary.launch_checklist">${esc(s.launch_checklist.join('\n'))}</textarea></div>
        <div class="field"><label for="au">Your name for the cover <span class="sub">(optional)</span></label><input class="input" id="au" data-bind="author" value="${esc(state.author)}" placeholder="e.g. Jordan Lee"></div>
      </div>
      <h3 style="margin-top:10px">Download</h3>
      <div class="downloads">
        <div class="download"><h3>Your workbook</h3><p>Editable Word file. Opens in Word, Google Docs, Pages and Canva.</p><button type="button" class="btn primary small" data-export="workbook">Download workbook (.docx)</button></div>
        <div class="download"><h3>Print or PDF</h3><p>Printable layout with writing space. Choose "Save as PDF" to sell a PDF.</p><button type="button" class="btn small" data-act="print">Print or save as PDF</button></div>
        <div class="download"><h3>Product summary</h3><p>Your strength, customer, description, price and launch checklist.</p><button type="button" class="btn small" data-export="summary">Download summary (.docx)</button></div>
      </div>
      <div class="actions"><button type="button" class="btn quiet small" data-act="redoSummary" ${left('summary') === 0 ? 'disabled' : ''}>Rewrite the description and checklist</button>${leftNote('summary')}</div>` : ''}
    </section>`;
  },
};

function riskyWarn(list) {
  return list.length ? `<p class="warn">Heads up: avoid ${list.join(', ')}. Income claims can break FTC rules and ad-platform policies. Describe what's inside and who it helps instead.</p>` : '';
}

function currentPrice() {
  const s = suggestPrice(state.validation.comparables);
  const o = Number(String(state.priceOverride).replace(/[$,\s]/g, ''));
  return { suggested: s.price, price: Number.isFinite(o) && o > 0 ? o : s.price, note: s.note };
}

function blocksToText(blocks = []) {
  return blocks.map((b) => [b.text, ...b.items.map((i) => `- ${i}`)].filter(Boolean).join('\n')).join('\n\n');
}

function blockHtml(b, sid, n, editable = true) {
  const ce = (path) => (editable ? `contenteditable="true" data-edit="sections.${sid}.blocks.${n}.${path}"` : '');
  const items = (tag, cls = '') => `${b.text ? `<p class="lead-in" ${ce('text')}>${esc(b.text)}</p>` : ''}<${tag} class="${cls}">${b.items.map((it, k) => `<li ${ce(`items.${k}`)}>${esc(it)}</li>`).join('')}</${tag}>`;
  switch (b.type) {
    case 'heading': return `<h4 ${ce('text')}>${esc(b.text)}</h4>`;
    case 'bullets': return items('ul');
    case 'steps': return items('ol');
    case 'checklist': return items('ul', 'check');
    case 'question': return `<div class="qblock"><p ${ce('text')}>${esc(b.text)}</p><div class="lines"></div></div>`;
    case 'tip': return `<div class="tip"><b>Tip:</b> <span ${ce('text')}>${esc(b.text)}</span></div>`;
    default: return `<p ${ce('text')}>${esc(b.text)}</p>`;
  }
}

function sectionCard(s) {
  const content = state.sections[s.id];
  const writing = ui.writing.has(s.id);
  const body = content?.blocks?.length && !writing
    ? `<div class="sec-body">${content.blocks.map((b, n) => blockHtml(b, s.id, n)).join('')}</div>
       <div class="sec-foot">
         <input class="input" id="ins-${s.id}" placeholder="What should change? e.g. shorter, add an example" aria-label="Rewrite instructions for ${esc(s.title)}">
         <button type="button" class="btn small" data-rewrite="${s.id}" ${left('regenerations') === 0 || ui.writing.size ? 'disabled' : ''}>Rewrite</button>
         ${state.previous[s.id] ? `<button type="button" class="btn small quiet" data-undo="${s.id}">Undo rewrite</button>` : ''}
         ${leftNote('regenerations')}
       </div>`
    : `<div class="sec-pending">${writing ? '<span class="spin" aria-hidden="true"></span>Writing this section…' : 'Not written yet.'}</div>`;
  return `<article class="sec" id="sec-${s.id}"><div class="sec-top"><h3>${esc(s.title)}</h3></div>${body}</article>`;
}

function renderPrint() {
  const o = state.outline;
  if (!o) { $('printDoc').innerHTML = ''; return; }
  $('printDoc').innerHTML = `<div class="cover"><h1>${esc(state.summary?.product_title || o.title)}</h1><p>${esc(o.subtitle)}</p>${state.author ? `<p style="margin-top:24pt">By ${esc(state.author)}</p>` : ''}</div>
    ${o.sections.map((s) => `<section><h2>${esc(s.title)}</h2>${(state.sections[s.id]?.blocks || []).map((b, n) => blockHtml(b, s.id, n, false)).join('')}</section>`).join('')}`;
}

function renderMeter() {
  const m = $('meter');
  if (!DEBUG) { m.hidden = true; return; }
  m.hidden = false;
  const u = state.usage;
  const rows = Object.entries(LIMITS).filter(([k]) => !k.endsWith('Chars')).map(([k, v]) => `<tr><td>${k}</td><td>${used(k)} / ${v}</td></tr>`).join('');
  m.innerHTML = `<b>AI cost meter${u.estimated ? ' (estimated, test mode)' : ''}</b><br>
    Total: $${u.cost.toFixed(4)} | tokens in ${u.tokensIn.toLocaleString()} | out ${u.tokensOut.toLocaleString()} | calls ${(u.log || []).length}
    <table>${rows}</table>`;
}

function render() {
  renderProgress();
  renderBanner();
  view.innerHTML = VIEWS[state.step]();
  renderPrint();
  renderMeter();
}

/* ---------- Events ---------- */

view.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.bind) {
    setPath(state, t.dataset.bind, t.value);
    if (t.dataset.live === 'evidence') liveEvidence();
    if (t.dataset.live === 'risky') $('riskyWarn').innerHTML = riskyWarn(riskyPhrases(`${state.summary.product_title} ${state.summary.short_description} ${state.summary.sales_description}`));
    if (state.step === 'build' || state.step === 'review') renderPrint();
    save();
  } else if (t.dataset.lines) {
    setPath(state, t.dataset.lines, t.value.split('\n').map((x) => x.trim()).filter(Boolean));
    save();
  } else if (t.dataset.edit) {
    setPath(state, t.dataset.edit, t.textContent.trim());
    renderPrint();
    save();
  } else if (t.dataset.rejectReason) {
    const r = state.rejected.find((x) => x.name === t.dataset.rejectReason);
    if (r) { r.reason = t.value; save(); }
  }
});
view.addEventListener('keydown', (e) => {
  if (e.target.id === 'accessCode' && e.key === 'Enter') { e.preventDefault(); view.querySelector('[data-act=start]')?.click(); return; }
  if (e.target.dataset.edit && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
});

function liveEvidence() {
  const lvl = evidenceLevel(state.validation);
  const idx = EVIDENCE_LEVELS.findIndex((l) => l.key === lvl.key);
  $('evLabel').textContent = lvl.label;
  $('evDetail').textContent = lvl.detail;
  view.querySelectorAll('.meter i').forEach((el, n) => el.classList.toggle('on', n < idx));
  const p = suggestPrice(state.validation.comparables);
  $('pxVal').textContent = money(p.price);
  $('pxNote').textContent = p.note;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;

  if (d.go !== undefined) return go(d.go);
  if (d.q !== undefined) { state.qIndex = Number(d.q); save(); return render(); }
  if (d.pick !== undefined) { state.pick = d.pick === '' ? null : Number(d.pick); state.correction = ''; return render(); }
  if (d.reject) { state.rejected.push({ name: d.reject, reason: '' }); if (state.pick !== null && state.strengthList[state.pick]?.name === d.reject) state.pick = null; save(); return render(); }
  if (d.unreject) { state.rejected = state.rejected.filter((x) => x.name !== d.unreject); save(); return render(); }
  if (d.chip) {
    const L = state.lifestyle;
    if (d.single === 'true') L[d.chip] = L[d.chip] === d.v ? '' : d.v;
    else L[d.chip] = L[d.chip].includes(d.v) ? L[d.chip].filter((x) => x !== d.v) : [...L[d.chip], d.v];
    save(); return render();
  }
  if (d.idea !== undefined) {
    const i = state.ideas[Number(d.idea)];
    state.idea = { ...i, sourceIndex: Number(d.idea) };
    state.outline = null; state.sections = {}; state.previous = {}; state.summary = null;
    save(); render();
    document.querySelector('#it')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (d.rewrite) {
    const instruction = $(`ins-${d.rewrite}`)?.value || '';
    return run(() => writeSection(d.rewrite, { instruction }));
  }
  if (d.undo) { state.sections[d.undo] = state.previous[d.undo]; delete state.previous[d.undo]; save(); return render(); }
  if (d.export) return exportDoc(d.export, b);

  switch (d.act) {
    case 'start': {
      if (ui.server.accessRequired && !(await verifyCode())) return;
      return go(state.lastStep && reachable(state.lastStep) ? state.lastStep : 'discover');
    }
    case 'reset':
      if (confirm('Start over? This clears your answers and your workbook from this browser.')) { state = blank(); save(true); render(); }
      return;
    case 'nextQ': return nextQuestion();
    case 'prevQ': state.qIndex = Math.max(0, state.qIndex - 1); save(); return render();
    case 'differentStrengths': return findStrengths({ different: true });
    case 'confirmStrength': {
      const s = state.strengthList[state.pick];
      const changed = state.strength?.name !== s.name;
      state.strength = { ...s, correction: state.correction.trim() };
      if (changed) { state.ideas = []; state.idea = null; state.outline = null; state.sections = {}; state.summary = null; }
      save(); return go('preferences');
    }
    case 'moreIdeas': return findIdeas();
    case 'outline': return makeOutline();
    case 'newOutline':
      if (Object.keys(state.sections).length && !confirm('Create a new outline? This replaces the sections written so far.')) return;
      return makeOutline();
    case 'writeAll': return writeAll();
    case 'redoSummary': return makeSummary();
    case 'print': renderPrint(); return window.print();
    case 'retry': { const r = ui.retry; ui.error = null; ui.retry = null; render(); return r?.(); }
    default:
  }
});

async function exportDoc(kind, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>Preparing…';
  try {
    const project = {
      outline: { ...state.outline, title: state.summary?.product_title || state.outline.title },
      sections: state.sections, author: state.author, summary: state.summary, strength: state.strength,
      idea: state.idea, lifestyle: state.lifestyle, validation: state.validation,
      evidence: evidenceLevel(state.validation),
      price: { price: currentPrice().price, note: currentPrice().note },
    };
    const headers = { 'content-type': 'application/json' };
    const code = localStorage.getItem(CODE_STORE); if (code) headers['x-access-code'] = code;
    const res = await fetch('api/export', { method: 'POST', headers, body: JSON.stringify({ kind, project }) });
    if (!res.ok) throw new Error('The download could not be prepared. Try again.');
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `${kind}.docx`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Downloaded.');
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

/* ---------- Progress file (save on one device, resume on another) ---------- */

$('saveFile').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ ...state, savedAt: new Date().toISOString(), appVersion: APP_VERSION }, null, 2)], { type: 'application/json' });
  const name = (state.idea?.title || 'my-product').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'my-product';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}-progress.json` });
  document.body.append(a); a.click(); a.remove();
  toast('Progress file saved. Open it on any device to continue.');
});
$('openFile').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.schema !== DATA_SCHEMA) throw new Error();
    state = { ...blank(), ...data };
    save(true); render(); toast('Progress opened.');
  } catch {
    toast('That file could not be opened. Choose a progress file saved from this tool.');
  }
  e.target.value = '';
});

/* ---------- Embed in GoHighLevel: report height ---------- */
if (document.documentElement.classList.contains('embed') && window.parent !== window) {
  const post = () => window.parent.postMessage({ type: 'pig-product-creator:height', height: document.documentElement.scrollHeight, version: APP_VERSION }, '*');
  new ResizeObserver(post).observe(document.body);
  post();
}

/* ---------- Start ---------- */
$('versionLine').textContent = `Expertise-to-Digital-Product Creator v${APP_VERSION}, AI instructions v${PROMPT_VERSION}`;
render();
fetch('api/ai').then((r) => r.json()).then((s) => { ui.server = s; render(); autoStart(); }).catch(() => { autoStart(); });
