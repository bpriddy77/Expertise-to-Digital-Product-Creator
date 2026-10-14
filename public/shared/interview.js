/**
 * The guided interview: five stages, one primary question at a time.
 * Built backward from the Authority Funnel Map: every question feeds a part of the map
 * (noted in `feeds`). The AI may add one follow-up per question and tailors the examples
 * for the next question to the customer's own business.
 */
export const STAGES = Object.freeze([
  { id: 'business', n: 1, label: 'Your business', intro: 'First, the business you already run and the offer you want more people to buy.' },
  { id: 'process', n: 2, label: 'How you work with customers', intro: 'Now the steps you already take customers through. This is where most products hide.' },
  { id: 'assets', n: 3, label: 'What you already have', intro: 'Most business owners have already made the raw material for their products. Let’s find it.' },
  { id: 'connect', n: 4, label: 'Leading to your main offer', intro: 'Each product should move buyers one step closer to your signature offer.' },
  { id: 'evaluate', n: 5, label: 'What people already ask for', intro: 'Last stage. Real requests are the best sign a product will sell.' },
]);

export const QUESTIONS = Object.freeze([
  {
    id: 'q1', stage: 'business', feeds: 'business',
    prompt: 'What do you sell, and who usually buys it?',
    help: 'A sentence or two is plenty. Say it the way you would to a friend.',
    examples: [
      'I design websites for therapists and coaches who have outgrown their DIY site.',
      'I coach busy parents to plan and cook weeknight dinners.',
      'I make custom memory quilts from clothing and teach beginner quilting classes.',
    ],
  },
  {
    id: 'q2', stage: 'business', feeds: 'signature offer',
    prompt: 'What is your signature offer: the main thing you want more people to buy? Include the price if you are comfortable.',
    help: 'This is where your Authority Funnel leads. It might be a program, a membership, a project, a retainer or a premium product.',
    examples: [
      'A 12-week coaching program, $1,200.',
      'A custom website build, $3,500.',
      'Done-for-you HR setup for small businesses, $4,800.',
    ],
  },
  {
    id: 'q3', stage: 'business', feeds: 'other offers', optional: true,
    prompt: 'Do you sell anything else, like a membership, workshop, retainer or course?',
    help: 'Skip this if your signature offer is the only thing you sell.',
    examples: ['A $29 a month recipe membership.', 'A $95 one-day workshop.', 'A $900 a month support retainer.'],
  },
  {
    id: 'q4', stage: 'process', feeds: 'journey stages',
    prompt: 'Walk me through what happens from the first time someone contacts you to the result they get.',
    help: 'List the steps in order. Rough is fine: "inquiry, call, proposal, kickoff, ..."',
    examples: [
      'Free consult, intake form, pantry check, weekly calls and meal plans, graduation call.',
      'Inquiry, quote, deposit, they mail garments, I send a layout, I sew, I ship with a care card.',
    ],
  },
  {
    id: 'q5', stage: 'process', feeds: 'recurring problems',
    prompt: 'What do you find yourself explaining or repeating to almost every customer?',
    help: 'Think of the questions you could answer in your sleep.',
    examples: ['How to gather their photos and copy.', 'What to swap when a child won’t eat something.', 'How to wash the finished piece.'],
  },
  {
    id: 'q6', stage: 'process', feeds: 'preparation problems',
    prompt: 'What do people need to learn, gather or decide before your main work can begin?',
    help: 'Anything that slows the start, or that customers often arrive without.',
    examples: ['Their service descriptions and photos.', 'Which garments to use and how many.', 'Their current policies and documents.'],
  },
  {
    id: 'q7', stage: 'assets', feeds: 'existing assets',
    prompt: 'What have you already made to help customers? Think of anything in Canva, Google Docs, your email or your files.',
    help: 'Worksheets, checklists, templates, questionnaires, emails you send again and again, slides, recordings, recipes, patterns, scripts.',
    examples: ['A content questionnaire in Google Docs and a "what we need from you" email.', 'A pantry staples list and a Sunday prep routine handout.', 'A job description template and an interview scorecard.'],
  },
  {
    id: 'q8', stage: 'assets', feeds: 'recurring problems',
    prompt: 'Where do customers get stuck, arrive unprepared or keep asking the same questions?',
    help: 'Include anything that delays results or frustrates you both.',
    examples: ['Projects stall for weeks waiting on content.', 'Picky eaters derail the plan in week one.', 'Managers avoid hard conversations.'],
  },
  {
    id: 'q9', stage: 'assets', feeds: 'time savings', optional: true,
    prompt: 'What takes up time that you would rather not spend?',
    help: 'Optional. Repeated explanations and chasing are common answers.',
    examples: ['Chasing clients for content.', 'Answering the same "how do I" emails after delivery.'],
  },
  {
    id: 'q10', stage: 'connect', feeds: 'connections',
    prompt: 'What would make someone more ready to buy your signature offer?',
    help: 'What do your best customers already know, have or believe before they buy?',
    examples: ['They already know what content their site needs.', 'They have tried planning and seen it work.', 'They understand how much a proper HR setup involves.'],
  },
  {
    id: 'q11', stage: 'connect', feeds: 'product formats',
    prompt: 'Which parts of what you do could someone do on their own, with good guidance?',
    help: 'These are often the easiest products: a template, a checklist, a short video or a planner.',
    examples: ['Gathering their content.', 'Planning two weeks of dinners.', 'Writing a job description.'],
  },
  {
    id: 'q12', stage: 'evaluate', feeds: 'evidence',
    prompt: 'Has anyone asked to buy or borrow something from you, like a template or guide, or asked "can you teach me how"?',
    help: 'Requests like these are the strongest evidence a product will sell. "Not yet" is a fine answer.',
    examples: ['Workshop students ask to buy my pattern.', 'Prospects ask whether I have a DIY version.', 'Not yet.'],
  },
  {
    id: 'q13', stage: 'evaluate', feeds: 'priorities', optional: true,
    prompt: 'What would you most like these products to do for your business?',
    help: 'Optional. For example: bring in buyers from ads, prepare people for your main offer, or save you time.',
    examples: ['Bring better-prepared people to my sales calls.', 'Help people who can’t afford me yet.', 'Stop me explaining the same thing every week.'],
  },
]);

export const LIMITS_INTERVIEW = Object.freeze({ answer: 1500, followUp: 1000 });

/** Answers object: { [questionId]: { answer, followUpQuestion, followUpAnswer, skipped } } */
export function answeredCount(answers = {}) {
  return QUESTIONS.filter((q) => (answers[q.id]?.answer || '').trim()).length;
}
export function requiredMissing(answers = {}) {
  return QUESTIONS.filter((q) => !q.optional && !(answers[q.id]?.answer || '').trim());
}
/** The map needs at least the business, the signature offer and some process detail. */
export const ESSENTIAL = Object.freeze(['q1', 'q2', 'q4']);
export function readyToMap(answers = {}) {
  return ESSENTIAL.every((id) => (answers[id]?.answer || '').trim()) && answeredCount(answers) >= 6;
}
