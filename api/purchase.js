/**
 * HighLevel purchase webhook.
 *   POST /api/purchase?key=<GHL_WEBHOOK_SECRET>
 * Body: HighLevel's standard workflow webhook (contact fields at the top level). Add custom data
 * contact_id = {{contact.id}} so the contact id is always present.
 *
 * Creates the buyer (or finds them again: upsells and bumps fire the same trigger), writes their
 * personal link into the contact field "Authority Map Link", and tags the contact. Safe to repeat.
 */
import { getStore, storeMode } from '../lib/store.js';
import { accessLink, secretMatches } from '../lib/links.js';
import { ghl, buyerFromWebhook, TAGS } from '../lib/ghl.js';
import { readBody, send, query, fail, log, HttpError } from '../lib/http.js';

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
    const body = await readBody(req);
    const expected = String(env.GHL_WEBHOOK_SECRET || '').trim();
    const given = query(req).get('key') || req.headers?.['x-webhook-secret'] || body.key || body.customData?.key || '';
    if (expected) {
      if (!secretMatches(given, expected)) throw new HttpError(401, 'Not allowed.');
    } else if (storeMode(env) === 'supabase') {
      throw new HttpError(503, 'Setup needed.', 'GHL_WEBHOOK_SECRET is not set in Vercel.');
    }

    const who = buyerFromWebhook(body);
    if (!who.ghlContactId && !who.email) throw new HttpError(400, 'No contact in the webhook.', 'Add custom data contact_id = {{contact.id}} to the HighLevel webhook action.');

    const store = getStore(env, fetchImpl);
    const { buyer, created } = await store.upsertBuyer(who);
    const link = accessLink(req, buyer, env);

    let field = 'skipped';
    if (who.ghlContactId) {
      const api = ghl(env, fetchImpl);
      await api.setLinkField(who.ghlContactId, link);
      await api.addTags(who.ghlContactId, [TAGS.buyer]);
      field = api.live ? 'written' : 'test-mode';
    }
    log('purchase', { created, field });
    return send(res, 200, { ok: true, created, field });
  } catch (e) {
    return fail(res, e, 'purchase_error');
  }
}
