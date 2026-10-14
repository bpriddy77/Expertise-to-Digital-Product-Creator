/**
 * POST /api/export  { kind: "workbook" | "summary", project }  →  .docx file
 * No AI and no cost. Nothing is stored.
 */
import { buildWorkbookDoc, buildSummaryDoc, toBuffer } from '../lib/docx-builder.js';
import { accessOk } from '../lib/access.js';

const MAX_BODY = 400_000;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const safeName = (s) => String(s || 'workbook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'workbook';

export default async function handler(req, res, { env = process.env } = {}) {
  const fail = (status, error) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error }));
  };
  if (req.method !== 'POST') return fail(405, 'Use POST.');
  if (!accessOk(req, env)) return fail(401, 'That access code doesn\'t match. Check your purchase email and try again.');

  let body;
  try { body = await readBody(req); } catch { return fail(400, 'The export request could not be read.'); }
  const { kind, project = {} } = body;

  let doc, name;
  if (kind === 'workbook') {
    doc = buildWorkbookDoc({ outline: project.outline, sections: project.sections, author: project.author });
    name = safeName(project.summary?.product_title || project.outline?.title);
  } else if (kind === 'summary') {
    doc = buildSummaryDoc(project);
    name = `${safeName(project.summary?.product_title || project.idea?.title)}-summary`;
  } else {
    return fail(400, 'Unknown export.');
  }

  const buf = await toBuffer(doc);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('content-disposition', `attachment; filename="${name}.docx"`);
  res.setHeader('cache-control', 'no-store');
  res.end(buf);
}
