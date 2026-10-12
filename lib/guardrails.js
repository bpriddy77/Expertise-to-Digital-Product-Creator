/**
 * Checks applied to every AI response before it reaches the customer.
 * The most important: evidence quotes must really appear in the customer's answers,
 * so a strength can never rest on words they did not say.
 */
import { QUESTIONS } from '../public/shared/questions.js';
import { BLOCK_TYPES } from './schemas.js';

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[‘’`´]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^a-z0-9'"$%]+/g, ' ')
  .trim();

/** All text the customer wrote, per question id. */
function answerTextById(answers = {}) {
  const out = {};
  for (const q of QUESTIONS) {
    const a = answers[q.id] || {};
    out[q.id] = norm(`${a.answer || ''} ${a.followUpAnswer || ''}`);
  }
  return out;
}

/** True when the quote appears in the customer's own words (in the named answer, or any answer). */
export function quoteIsGenuine(quote, questionId, answers) {
  const q = norm(quote);
  if (q.split(' ').filter(Boolean).length < 2) return false;
  const byId = answerTextById(answers);
  if (byId[questionId] && byId[questionId].includes(q)) return true;
  return Object.values(byId).some((t) => t.includes(q));
}

const s = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

export const CLEAN = {
  followup(d) {
    const needs = Boolean(d.needs_follow_up) && s(d.follow_up_question).length > 0;
    return { needs_follow_up: needs, follow_up_question: needs ? s(d.follow_up_question, 300) : '', acknowledgement: s(d.acknowledgement, 300) };
  },

  strengths(d, payload) {
    const removed = [];
    const strengths = (d.strengths || []).slice(0, 3).map((st) => {
      const evidence = (st.evidence || []).filter((e) => {
        const ok = quoteIsGenuine(e.quote, e.question_id, payload.answers);
        if (!ok) removed.push(e.quote);
        return ok;
      }).slice(0, 3).map((e) => ({ quote: s(e.quote, 400), question_id: s(e.question_id, 10) }));
      return {
        name: s(st.name, 120),
        summary: s(st.summary, 600),
        kind: ['demonstrated', 'interest', 'mixed'].includes(st.kind) ? st.kind : 'mixed',
        enjoyment: ['high', 'medium', 'low', 'unclear'].includes(st.enjoyment) ? st.enjoyment : 'unclear',
        evidence,
        who_it_could_help: s(st.who_it_could_help, 300),
      };
    }).filter((st) => st.name && st.evidence.length > 0); // no evidence in their own words, no suggestion
    return { strengths, thin_evidence_note: s(d.thin_evidence_note, 600), removed_quotes: removed.length };
  },

  ideas(d) {
    return {
      ideas: (d.ideas || []).slice(0, 3).map((i) => ({
        title: s(i.title, 160), audience: s(i.audience, 300), problem: s(i.problem, 400),
        transformation: s(i.transformation, 400), why_useful: s(i.why_useful, 600),
        lifestyle_fit: s(i.lifestyle_fit, 400),
        what_to_validate: (i.what_to_validate || []).map((x) => s(x, 200)).filter(Boolean).slice(0, 4),
      })).filter((i) => i.title),
    };
  },

  outline(d) {
    let sections = (d.sections || []).map((x) => ({
      kind: ['intro', 'exercise', 'outcome'].includes(x.kind) ? x.kind : 'exercise',
      title: s(x.title, 160), purpose: s(x.purpose, 300),
    })).filter((x) => x.title);
    // Keep one intro first and one outcome last; at most 6 exercises in between.
    const intro = sections.find((x) => x.kind === 'intro');
    const outcome = [...sections].reverse().find((x) => x.kind === 'outcome');
    const exercises = sections.filter((x) => x.kind === 'exercise').slice(0, 6);
    sections = [intro, ...exercises, outcome].filter(Boolean);
    sections.forEach((x, n) => { x.id = `s${n + 1}`; });
    return { title: s(d.title, 160), subtitle: s(d.subtitle, 240), sections };
  },

  section(d) {
    return {
      blocks: (d.blocks || []).map((b) => {
        const type = BLOCK_TYPES.includes(b.type) ? b.type : 'paragraph';
        const items = ['bullets', 'steps', 'checklist'].includes(type) ? (b.items || []).map((x) => s(x, 500)).filter(Boolean).slice(0, 15) : [];
        return { type, text: s(b.text, 2000), items };
      }).filter((b) => b.text || b.items.length).slice(0, 40),
    };
  },

  summary(d) {
    const list = (v, n) => (v || []).map((x) => s(x, 240)).filter(Boolean).slice(0, n);
    return {
      product_title: s(d.product_title, 160),
      short_description: s(d.short_description, 400),
      sales_description: s(d.sales_description, 2000),
      who_its_for: list(d.who_its_for, 5),
      what_they_get: list(d.what_they_get, 6),
      launch_checklist: list(d.launch_checklist, 10),
    };
  },
};

export { riskyPhrases } from '../public/shared/rules.js';
