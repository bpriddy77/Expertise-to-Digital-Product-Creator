/** Small helpers shared by the /api functions. */
export const MAX_BODY = 120_000; // characters

export class HttpError extends Error {
  constructor(status, message, detail = '') { super(message); this.status = status; this.detail = detail; }
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new HttpError(413, 'That is too much text to send at once.');
  }
  if (!raw) return {};
  const type = String(req.headers?.['content-type'] || '');
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'The request could not be read.'); }
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}

export const query = (req) => new URL(req.url || '/', 'http://x').searchParams;
export const tokenFrom = (req) => String(req.headers?.['x-map-token'] || '').trim();

/** Log without customer text: event name plus safe fields only. */
export const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));

/** Turn any thrown error into a calm response; owner detail only when ?debug=1 is used by the page. */
export function fail(res, e, event) {
  const status = e.status || 500;
  log(event, { status, detail: e.detail || e.message });
  return send(res, status, { ok: false, error: e.status ? e.message : 'Something went wrong. Try again.', retryable: e.retryable ?? status >= 500, detail: e.detail || undefined });
}
