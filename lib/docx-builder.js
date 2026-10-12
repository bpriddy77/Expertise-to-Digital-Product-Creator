/**
 * Word (.docx) exports.
 * The workbook belongs to the customer, so it uses neutral styling, not Priddy Impact Group branding.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat,
  BorderStyle, Footer, PageNumber, PageBreak, TabStopType, UnderlineType,
} from 'docx';

const FONT = 'Calibri';
const INK = '1F2937';
const MUTED = '6B7280';

const styles = {
  default: { document: { run: { font: FONT, size: 23, color: INK }, paragraph: { spacing: { after: 140, line: 300 } } } },
  paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 52, bold: true, font: FONT }, paragraph: { spacing: { after: 200 } } },
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, font: FONT }, paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
  ],
};

const numbering = {
  config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ],
};

const footer = () => ({
  default: new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: MUTED })] })],
  }),
});

const p = (text, opts = {}) => new Paragraph({ ...opts, children: [new TextRun({ text: String(text ?? ''), ...(opts.run || {}) })] });
// A fill-in line: an underlined tab that runs to the right margin (renders the same in Word, Google Docs and LibreOffice).
const TEXT_WIDTH = 9360; // 8.5in page minus two 1in margins, in twentieths of a point
const writeLine = () => new Paragraph({
  spacing: { before: 300, after: 0 },
  tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
  children: [new TextRun({ text: '\t', underline: { type: UnderlineType.SINGLE, color: 'B8BEC8' } })],
});

let listInstance = 0;
function blockToParagraphs(b) {
  const out = [];
  switch (b.type) {
    case 'heading':
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] }));
      break;
    case 'bullets':
    case 'steps': {
      if (b.text) out.push(p(b.text, { run: { bold: true } }));
      const instance = ++listInstance;
      for (const item of b.items) {
        out.push(new Paragraph({ numbering: { reference: b.type === 'steps' ? 'steps' : 'bullets', level: 0, instance }, children: [new TextRun(item)] }));
      }
      break;
    }
    case 'checklist':
      if (b.text) out.push(p(b.text, { run: { bold: true } }));
      for (const item of b.items) out.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: '☐  ' }), new TextRun(item)] }));
      break;
    case 'question':
      out.push(new Paragraph({ spacing: { before: 200, after: 60 }, keepNext: true, children: [new TextRun({ text: b.text, bold: true })] }));
      for (let n = 0; n < 4; n++) out.push(writeLine());
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      break;
    case 'tip':
      out.push(new Paragraph({
        shading: { fill: 'F3F4F6', type: 'clear', color: 'auto' },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: '9CA3AF', space: 8 } },
        indent: { left: 200, right: 200 },
        spacing: { before: 160, after: 160 },
        children: [new TextRun({ text: 'Tip: ', bold: true }), new TextRun(b.text)],
      }));
      break;
    default:
      out.push(p(b.text));
  }
  return out;
}

export function buildWorkbookDoc({ outline = {}, sections = {}, author = '' } = {}) {
  listInstance = 0;
  const children = [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({ style: 'Title', children: [new TextRun(outline.title || 'My Workbook')] }),
  ];
  if (outline.subtitle) children.push(p(outline.subtitle, { run: { size: 28, color: MUTED } }));
  if (author) children.push(p(`By ${author}`, { spacing: { before: 400 }, run: { size: 24 } }));

  for (const s of outline.sections || []) {
    const blocks = sections[s.id]?.blocks || [];
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(s.title)] }));
    if (!blocks.length) children.push(p('This section has not been written yet.', { run: { italics: true, color: MUTED } }));
    for (const b of blocks) children.push(...blockToParagraphs(b));
  }

  return new Document({
    creator: author || 'Expertise-to-Digital-Product Creator',
    title: outline.title || 'Workbook',
    styles, numbering,
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, footers: footer(), children }],
  });
}

export function buildSummaryDoc(project = {}) {
  listInstance = 0;
  const { strength = {}, idea = {}, summary = {}, price = {}, evidence = {}, validation = {}, lifestyle = {} } = project;
  const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
  const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
  const bullets = (items) => blockToParagraphs({ type: 'bullets', text: '', items: (items || []).filter(Boolean) });
  const label = (k, v) => new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(String(v ?? ''))] });

  const comps = (validation.comparables || []).filter((c) => c?.name);
  const questions = (validation.questions || []).filter(Boolean);

  const children = [
    new Paragraph({ style: 'Title', children: [new TextRun(summary.product_title || idea.title || 'My Product')] }),
    p('Product summary and launch plan', { run: { size: 26, color: MUTED } }),

    h1('Your expertise'),
    label('Core strength', strength.name),
    p(strength.correction || strength.summary),
    ...(strength.evidence?.length ? [h2('In your own words'), ...bullets(strength.evidence.map((e) => `"${e.quote}"`))] : []),

    h1('Who it helps'),
    label('Target customer', idea.audience),
    label('Their problem', idea.problem),
    label('The result they get', idea.transformation),

    h1('Product information'),
    label('Title', summary.product_title),
    label('Short description', summary.short_description),
    h2('Sales description'),
    p(summary.sales_description),
    h2('Who it is for'), ...bullets(summary.who_its_for),
    h2('What they get'), ...bullets(summary.what_they_get),
    h2('Suggested starting price to test'),
    p(price.price ? `$${price.price}` : 'Not set', { run: { bold: true, size: 28 } }),
    p(price.note, { run: { color: MUTED } }),

    h1('Market check'),
    label('Evidence so far', evidence.label),
    p(evidence.detail, { run: { color: MUTED } }),
    ...(comps.length ? [h2('Similar products you found'), ...bullets(comps.map((c) => `${c.name}${c.price ? ` ($${c.price})` : ''}${c.link ? ` — ${c.link}` : ''}`))] : []),
    ...(questions.length ? [h2('Questions people ask'), ...bullets(questions)] : []),
    ...(idea.what_to_validate?.length ? [h2('Still to check'), ...bullets(idea.what_to_validate)] : []),

    h1('Launch-readiness checklist'),
    ...blockToParagraphs({ type: 'checklist', text: '', items: summary.launch_checklist || [] }),

    ...(lifestyle.avoid?.length || lifestyle.involvement ? [h1('Your business preferences'), ...(lifestyle.involvement ? [label('Involvement', lifestyle.involvement)] : []), ...(lifestyle.avoid?.length ? [label('Avoid', lifestyle.avoid.join(', '))] : [])] : []),

    new Paragraph({ spacing: { before: 480 }, children: [new TextRun({ text: 'This summary is a planning aid, not a prediction of sales or income. Test your product with real buyers and adjust.', italics: true, size: 18, color: MUTED })] }),
  ];

  return new Document({
    creator: 'Expertise-to-Digital-Product Creator',
    title: `${summary.product_title || 'Product'}: summary`,
    styles, numbering,
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, footers: footer(), children }],
  });
}

export const toBuffer = (doc) => Packer.toBuffer(doc);
