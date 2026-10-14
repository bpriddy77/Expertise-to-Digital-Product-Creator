/**
 * Daily data retention job (Vercel Cron, see vercel.json): deletes buyers, answers and maps with no
 * activity for 12 months. Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
 * RETENTION_MONTHS (optional) changes the period.
 */
import { getStore } from '../lib/store.js';
import { secretMatches } from '../lib/links.js';
import { send, fail, log, HttpError } from '../lib/http.js';

export function cutoff(months = 12, now = new Date()) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

export default async function handler(req, res, { env = process.env, fetchImpl, now } = {}) {
  try {
    const secret = String(env.CRON_SECRET || '').trim();
    if (!secret) throw new HttpError(503, 'Setup needed.', 'Set CRON_SECRET in Vercel so the daily clean-up can run.');
    const auth = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!secretMatches(auth, secret)) throw new HttpError(401, 'Not allowed.');
    const months = Number(env.RETENTION_MONTHS) > 0 ? Number(env.RETENTION_MONTHS) : 12;
    const deleted = await getStore(env, fetchImpl).deleteInactiveSince(cutoff(months, now));
    log('cleanup', { deleted, months });
    return send(res, 200, { ok: true, deleted });
  } catch (e) {
    return fail(res, e, 'cleanup_error');
  }
}
