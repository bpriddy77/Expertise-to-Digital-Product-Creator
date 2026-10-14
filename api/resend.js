/**
 * "Email me my link": POST /api/resend { email }
 * If a buyer with that email exists, their contact gets the tag that starts the HighLevel
 * "resend link" workflow. The reply is the same either way, so it never reveals who has bought.
 */
import { getStore } from '../lib/store.js';
import { accessLink } from '../lib/links.js';
import { ghl, TAGS } from '../lib/ghl.js';
import { readBody, send, fail, log, HttpError } from '../lib/http.js';

const SAME_REPLY = 'If that email matches a purchase, your link is on its way. Check your inbox (and spam folder) in a few minutes.';

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, 'Enter the email address you used to buy.');
    const store = getStore(env, fetchImpl);
    const buyer = await store.findBuyerByEmail(email);
    let problem = '';
    if (buyer?.ghl_contact_id) {
      try {
        const api = ghl(env, fetchImpl);
        await api.setLinkField(buyer.ghl_contact_id, accessLink(req, buyer, env)); // make sure the field is current
        await api.addTags(buyer.ghl_contact_id, [TAGS.resend]);
      } catch (e) {
        problem = e.detail || e.message; // logged for the owner; the buyer still gets the same reply
      }
    }
    log('resend', { found: Boolean(buyer), problem: problem || undefined });
    return send(res, 200, { ok: true, message: SAME_REPLY });
  } catch (e) {
    return fail(res, e, 'resend_error');
  }
}
