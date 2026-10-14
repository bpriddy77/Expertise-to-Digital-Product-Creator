/**
 * Discovery interview. Shared by the page and the server.
 * Questions ask for real examples, so strengths come from evidence rather than self-labels.
 */
export const QUESTIONS = Object.freeze([
  {
    id: 'q1',
    text: 'What do people regularly ask you for help with?',
    hint: 'Friends, family, coworkers, people online. Think of the last few times someone said "Can you help me with…?"',
    example: 'My sister and two friends asked me to help them plan meals for picky kids.',
  },
  {
    id: 'q2',
    text: 'Tell me about a problem you solved, for yourself or someone else, that you are proud of.',
    hint: 'What was the situation, what did you do, and what changed afterward?',
    example: 'I got our family grocery bill down by about a third by planning a weekly menu and shopping list.',
  },
  {
    id: 'q3',
    text: 'What have you learned the hard way that you wish someone had told you sooner?',
    hint: 'Life, work, health, money, parenting, a hobby: anything counts.',
    example: 'That batch cooking on Sunday saves me hours, but only if I plan around what is on sale.',
  },
  {
    id: 'q4',
    text: 'What could you happily spend hours doing or talking about?',
    hint: 'This helps tell apart what you are good at from what you actually enjoy.',
    example: 'Organizing my pantry, trying new recipes, making checklists for everything.',
  },
  {
    id: 'q5',
    text: 'What jobs, roles, training or life experiences have shaped what you know?',
    hint: 'Paid or unpaid. Volunteering, raising a family and caregiving count.',
    example: '12 years as a school cafeteria manager, and I raised three kids on a tight budget.',
  },
]);

export const MAX_FOLLOW_UPS_PER_QUESTION = 1;
