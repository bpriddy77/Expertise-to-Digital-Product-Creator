/**
 * Test mode (AI_MODE=mock): sample responses so the whole flow can be clicked through
 * without an API key or any cost. Token counts are estimated from text length
 * (about 4 characters per token), which gives a rough preview of real costs.
 */
import { QUESTIONS } from '../public/shared/questions.js';

const firstWords = (text, n = 8) => String(text || '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');

function quoteFrom(answers, id) {
  const a = answers?.[id] || {};
  const q = firstWords(a.answer, 8);
  return q.split(' ').length >= 2 ? { quote: q, question_id: id } : null;
}

const SAMPLE = {
  followup(p) {
    const short = String(p.answer || '').trim().split(/\s+/).length < 12;
    return {
      needs_follow_up: short,
      follow_up_question: short ? 'Can you tell me about one specific time? Who was it, what did you do, and what changed?' : '',
      acknowledgement: short ? 'Thanks, that is a helpful start.' : 'That is a clear, specific example, thank you.',
    };
  },
  strengths(p) {
    const ev = (ids) => ids.map((id) => quoteFrom(p.answers, id)).filter(Boolean);
    const all = [
      { name: 'Budget-friendly family meal planning', summary: 'You turn a tight budget and busy schedule into a simple weekly meal plan people can follow.', kind: 'demonstrated', enjoyment: 'high', evidence: ev(['q1', 'q2']), who_it_could_help: 'Busy parents feeding a family on a budget.' },
      { name: 'Kitchen and pantry organizing', summary: 'You make cooking easier by organizing the kitchen so food gets used instead of wasted.', kind: 'mixed', enjoyment: 'high', evidence: ev(['q4']), who_it_could_help: 'People who waste food or feel overwhelmed in the kitchen.' },
      { name: 'Running large-scale food service', summary: 'You know how to plan, order and serve food for many people reliably.', kind: 'demonstrated', enjoyment: 'medium', evidence: ev(['q5']), who_it_could_help: 'Volunteers and small organizations that feed groups.' },
    ];
    const rejected = new Set((p.rejected || []).map((r) => r.name));
    return { strengths: all.filter((s) => !rejected.has(s.name)), thin_evidence_note: '' };
  },
  ideas(p) {
    return {
      ideas: [
        { title: 'The 30-Minute Sunday Meal Plan Workbook', audience: 'Busy parents feeding a family of 4–6 on a tight budget', problem: '"I never know what to cook, and groceries cost too much."', transformation: 'A repeatable weekly meal plan and shopping list they can make in 30 minutes.', why_useful: `Built on your real experience: ${p.strength?.name || 'your strength'}.`, lifestyle_fit: 'A self-guided workbook: no live calls or ongoing support needed.', what_to_validate: ['Whether busy parents would pay for a workbook rather than free meal plans', 'Which price feels right next to similar planners', 'Whether picky eaters need their own section'] },
        { title: 'Picky Eater Peace: A Family Menu Workbook', audience: 'Parents of picky kids aged 3–10', problem: '"Every dinner is a battle."', transformation: 'A short list of family meals everyone will eat, with swaps for picky kids.', why_useful: 'People already ask you for help with picky eaters.', lifestyle_fit: 'Self-paced; fits your preference to avoid live coaching.', what_to_validate: ['How many parents search for this', 'Whether it overlaps with free blog content'] },
        { title: 'Pantry Reset in a Weekend', audience: 'Home cooks who waste food and money', problem: '"I keep buying things I already have."', transformation: 'An organized pantry and a simple system to keep it that way.', why_useful: 'Uses the organizing you enjoy most.', lifestyle_fit: 'One-time product, little upkeep.', what_to_validate: ['Whether people pay for organizing help in workbook form', 'Competing printables and their prices'] },
      ],
    };
  },
  outline(p) {
    return {
      title: p.idea?.title || 'Your Workbook',
      subtitle: 'Plan a week of family meals and one shopping list, in about 30 minutes.',
      sections: [
        { id: 's1', kind: 'intro', title: 'Welcome: how this workbook works', purpose: 'Set expectations and get ready.' },
        { id: 's2', kind: 'exercise', title: 'Know your week', purpose: 'Map the busy nights and the easy nights.' },
        { id: 's3', kind: 'exercise', title: 'Your family\'s go-to meals', purpose: 'List meals everyone already eats.' },
        { id: 's4', kind: 'exercise', title: 'Plan around what is on sale', purpose: 'Build the menu from this week\'s deals.' },
        { id: 's5', kind: 'exercise', title: 'One list, one trip', purpose: 'Turn the menu into a single shopping list.' },
        { id: 's6', kind: 'outcome', title: 'Your first week, planned', purpose: 'Confirm what you finished and what comes next.' },
      ],
    };
  },
  section(p) {
    const target = (p.outline?.sections || []).find((s) => s.id === p.sectionId) || {};
    const changed = p.instruction ? ` (Updated: ${String(p.instruction).slice(0, 80)})` : '';
    if (target.kind === 'intro') {
      return { blocks: [
        { type: 'paragraph', text: `Welcome! This workbook walks you through planning a full week of family meals, step by step.${changed}`, items: [] },
        { type: 'heading', text: 'Who this is for', items: [] },
        { type: 'paragraph', text: 'Busy parents who want dinner to feel less stressful and cost less.', items: [] },
        { type: 'heading', text: 'What you need', items: [] },
        { type: 'bullets', text: '', items: ['About 30 minutes', 'A pen', 'This week\'s grocery store flyer or app'] },
        { type: 'tip', text: 'Do the first exercise on a calm evening, not on a busy night.', items: [] },
      ] };
    }
    if (target.kind === 'outcome') {
      return { blocks: [
        { type: 'paragraph', text: `You planned a full week and built one shopping list. That is a real system you can repeat.${changed}`, items: [] },
        { type: 'checklist', text: 'Check off what you finished:', items: ['I know which nights are busy', 'I have a list of go-to meals', 'My menu uses this week\'s deals', 'I have one shopping list'] },
        { type: 'question', text: 'What will you keep, and what will you change next week?', items: [] },
      ] };
    }
    return { blocks: [
      { type: 'paragraph', text: `${target.purpose || 'Work through this step.'}${changed}`, items: [] },
      { type: 'steps', text: 'Do this:', items: ['Read the example below.', 'Fill in your own answers.', 'Circle the one you will use this week.'] },
      { type: 'question', text: `What does "${target.title || 'this step'}" look like in your home right now?`, items: [] },
      { type: 'question', text: 'What is one small change you could try this week?', items: [] },
      { type: 'tip', text: 'Keep it simple. A plan you follow beats a perfect plan you skip.', items: [] },
    ] };
  },
  summary(p) {
    return {
      product_title: p.outline?.title || p.idea?.title || 'Your Workbook',
      short_description: 'A step-by-step workbook to plan a week of family meals and one shopping list in about 30 minutes.',
      sales_description: 'Dinner does not have to be a nightly scramble. This workbook guides you through planning a full week of family meals, step by step. You will map your busy nights, list the meals your family already eats, build your menu around what is on sale, and finish with one shopping list for one trip. Each exercise takes a few minutes and builds on the last, so by the end you have a simple routine you can repeat every week. It is written for real families with real schedules and real budgets, and it is designed to be filled in, not just read.',
      who_its_for: ['Busy parents cooking for a family', 'Anyone tired of deciding what is for dinner', 'Families shopping on a budget'],
      what_they_get: ['A guided weekly planning routine', '4 short exercises with writing space', 'A one-list shopping method', 'A checklist to confirm you are set for the week'],
      launch_checklist: ['Proofread the workbook and fill it in yourself once', 'Ask 3–5 parents to try it and share honest feedback', 'Update anything that confused them', 'Set up a simple sales page with the description', 'Start at your test price and track how many visitors buy', 'Collect feedback from your first buyers', 'Adjust the price or content based on what you learn'],
    };
  },
};

const estTokens = (v) => Math.ceil(JSON.stringify(v).length / 4);

export function mockCall(step, payload, { system, messages }) {
  const data = SAMPLE[step](payload);
  return {
    data,
    model: 'test-mode',
    usage: { input_tokens: estTokens(system) + estTokens(messages), output_tokens: estTokens(data) },
  };
}

export const MOCK_QUESTION_IDS = QUESTIONS.map((q) => q.id);
