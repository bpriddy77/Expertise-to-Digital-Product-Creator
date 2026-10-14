/**
 * Test mode: realistic AI replies without an API key, so the whole app can be clicked
 * through and tested for free. The map reply is the website-designer example in the AI's
 * response shape, with quotes taken from the test answers used by the automated tests.
 */
import { QUESTIONS } from '../public/shared/interview.js';
import { EXAMPLE_MAP } from '../public/shared/example-map.js';

export function mockCall(step, payload = {}) {
  if (step === 'followup') {
    const q = QUESTIONS.find((x) => x.id === payload.questionId);
    const idx = QUESTIONS.indexOf(q);
    const answer = (payload.answers?.[q.id]?.answer || '').trim();
    const vague = answer.split(/\s+/).length < 6 && !q.optional;
    const alreadyFollowed = Boolean(payload.answers?.[q.id]?.followUpQuestion);
    return {
      data: {
        acknowledgement: 'Thanks, that gives a clear picture of this part of your business.',
        needs_follow_up: vague && !alreadyFollowed,
        follow_up_question: vague ? 'Could you say a little more, with one specific example from a recent customer?' : '',
        follow_up_examples: vague ? ['A client last month needed...', 'Most new customers ask...'] : [],
        next_examples: QUESTIONS[idx + 1] ? QUESTIONS[idx + 1].examples.slice(0, 3) : [],
      },
      usage: { input_tokens: 900, output_tokens: 180 },
    };
  }
  if (step === 'map') {
    const m = EXAMPLE_MAP;
    return {
      data: {
        business: { name: m.business.name, what: m.business.what, buyer: m.business.buyer, buyerGoal: m.business.buyerGoal },
        offers: m.offers,
        process: m.process,
        assets: m.assets.map(({ id, stage, kind, name }) => ({ id, stage, kind, name })),
        problems: m.problems,
        opportunities: m.opportunities.map((o) => ({
          id: o.id, name: o.name, stage: o.stage, format: o.format, buyer: o.buyer, problem: o.problem, outcome: o.outcome,
          role: o.role, roleReason: o.roleReason, slot: o.slot, price: o.price,
          source_assets: o.sources.assets, source_problems: o.sources.problems, connects: o.connects,
          // Only the first product quotes the test answers word for word; the others paraphrase,
          // so the quote check visibly turns them into assumptions in test mode.
          evidence: o.evidence.map((e, n) => ({ ...e, quote: e.type !== 'fact' ? '' : o.id === 'op1' ? (n === 0 ? 'stall two to three weeks' : 'questionnaire in google docs') : e.text })),
          effort: o.effort,
        })),
        recommendation: { opportunityId: m.recommendation.opportunityId, why: m.recommendation.why, assumptions: m.recommendation.assumptions, validationStep: m.recommendation.validationStep },
        summary: m.summary,
        missing_info: '',
      },
      usage: { input_tokens: 4200, output_tokens: 5200 },
    };
  }
  throw new Error('Unknown step.');
}
