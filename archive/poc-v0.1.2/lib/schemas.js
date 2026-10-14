/**
 * JSON schemas for Claude structured outputs (output_config.format).
 * API rules: every object sets additionalProperties: false; no numeric or length constraints.
 * test/schemas.test.js checks these rules so a bad schema never reaches production.
 */

const str = (description) => ({ type: 'string', description });
const strArr = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const FOLLOWUP_SCHEMA = obj({
  needs_follow_up: { type: 'boolean', description: 'True only when the answer is too vague to find a concrete example.' },
  follow_up_question: str('One short, friendly question asking for a specific example. Empty string when needs_follow_up is false.'),
  acknowledgement: str('One short sentence reflecting something specific they said. No flattery.'),
});

export const STRENGTHS_SCHEMA = obj({
  strengths: {
    type: 'array',
    description: 'Up to three candidate strengths, strongest evidence first.',
    items: obj({
      name: str('Plain-language name for the strength, 2–6 words.'),
      summary: str('One or two sentences on what they can do for others.'),
      kind: { type: 'string', enum: ['demonstrated', 'interest', 'mixed'], description: 'demonstrated = done it with results or repeated requests; interest = enjoys or wants to learn; mixed = some of each.' },
      enjoyment: { type: 'string', enum: ['high', 'medium', 'low', 'unclear'] },
      evidence: {
        type: 'array',
        description: 'Short verbatim quotes copied exactly from their answers.',
        items: obj({ quote: str('Exact words from one answer.'), question_id: str('The id of the question the quote came from.') }),
      },
      who_it_could_help: str('Who would value this, in plain words.'),
    }),
  },
  thin_evidence_note: str('If the answers are too thin for confident suggestions, say what would help. Otherwise an empty string.'),
});

export const IDEAS_SCHEMA = obj({
  ideas: {
    type: 'array',
    description: 'Up to three workbook ideas.',
    items: obj({
      title: str('Working title for the workbook.'),
      audience: str('A specific group of people.'),
      problem: str('The problem they have, in their words.'),
      transformation: str('The result they get by finishing the workbook.'),
      why_useful: str('Why this could help them, grounded in the customer\'s real experience.'),
      lifestyle_fit: str('How it fits what the customer wants and avoids.'),
      what_to_validate: strArr('2–4 things still to check before calling this a sellable product.'),
    }),
  },
});

export const OUTLINE_SCHEMA = obj({
  title: str('Workbook title.'),
  subtitle: str('One-line promise of the result, no hype.'),
  sections: {
    type: 'array',
    description: 'Introduction, then 4–6 exercises, then the completion outcome.',
    items: obj({
      id: str('Short id like s1, s2.'),
      kind: { type: 'string', enum: ['intro', 'exercise', 'outcome'] },
      title: str('Section title.'),
      purpose: str('What this section helps the reader do.'),
    }),
  },
});

export const BLOCK_TYPES = ['heading', 'paragraph', 'bullets', 'steps', 'checklist', 'question', 'tip'];

export const SECTION_SCHEMA = obj({
  blocks: {
    type: 'array',
    description: 'The section content in reading order.',
    items: obj({
      type: { type: 'string', enum: BLOCK_TYPES, description: 'heading: sub-heading. paragraph: text. bullets/steps/checklist: use items. question: a writing prompt the reader answers in the space below. tip: a short practical tip.' },
      text: str('The text. For bullets/steps/checklist, an optional lead-in (or empty string).'),
      items: strArr('List items for bullets, steps and checklist. Empty array for other types.'),
    }),
  },
});

export const SUMMARY_SCHEMA = obj({
  product_title: str('Final product title.'),
  short_description: str('One or two sentences for a product card.'),
  sales_description: str('A basic sales description of 120–180 words. No income claims, testimonials, statistics or guarantees.'),
  who_its_for: strArr('3–4 short bullets.'),
  what_they_get: strArr('3–5 short bullets describing what is inside.'),
  launch_checklist: strArr('6–8 practical steps to get ready to sell and test it.'),
});

export const SCHEMAS = Object.freeze({
  followup: FOLLOWUP_SCHEMA,
  strengths: STRENGTHS_SCHEMA,
  ideas: IDEAS_SCHEMA,
  outline: OUTLINE_SCHEMA,
  section: SECTION_SCHEMA,
  summary: SUMMARY_SCHEMA,
});
