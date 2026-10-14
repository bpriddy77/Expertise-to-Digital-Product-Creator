/**
 * JSON schemas for structured outputs. Every object lists all properties as required and
 * sets additionalProperties: false; lengths and counts are enforced in guardrails.js instead.
 */
import { SLOT_ORDER, ROLES, RELATIONS, OFFER_KINDS, STAGES } from '../public/shared/map-model.js';

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const stageEnum = { type: 'string', enum: STAGES.map((s) => s.id) };

export const SCHEMAS = {
  followup: obj({
    acknowledgement: str,
    needs_follow_up: { type: 'boolean' },
    follow_up_question: str,
    follow_up_examples: strs,
    next_examples: strs,
  }),

  map: obj({
    business: obj({ name: str, what: str, buyer: str, buyerGoal: str }),
    offers: { type: 'array', items: obj({ id: str, kind: { type: 'string', enum: Object.keys(OFFER_KINDS) }, name: str, price: str, description: str }) },
    process: obj(Object.fromEntries(STAGES.map((s) => [s.id, str]))),
    assets: { type: 'array', items: obj({ id: str, stage: stageEnum, kind: str, name: str }) },
    problems: { type: 'array', items: obj({ id: str, stage: stageEnum, text: str }) },
    opportunities: {
      type: 'array',
      items: obj({
        id: str, name: str, stage: stageEnum, format: str, buyer: str, problem: str, outcome: str,
        role: { type: 'string', enum: Object.keys(ROLES) },
        roleReason: str,
        slot: { type: 'string', enum: ['', ...SLOT_ORDER] },
        price: str,
        source_assets: strs,
        source_problems: strs,
        connects: { type: 'array', items: obj({ offer: str, relation: { type: 'string', enum: Object.keys(RELATIONS) } }) },
        evidence: { type: 'array', items: obj({ type: { type: 'string', enum: ['fact', 'assumption'] }, text: str, quote: str }) },
        effort: str,
      }),
    },
    recommendation: obj({ opportunityId: str, why: strs, assumptions: strs, validationStep: str }),
    summary: str,
    missing_info: str,
  }),
};
