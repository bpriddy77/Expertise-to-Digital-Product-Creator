/**
 * The buyer chooses to send their map to Priddy Impact Group.
 *   POST   /api/share   header x-map-token  → adds a note with the summary and a read-only link
 *                                            to their HighLevel contact, plus a tag; returns { ok, viewLink }
 *   DELETE /api/share   header x-map-token  → stops sharing (old view links stop working)
 */
import { shareLink } from '../lib/links.js';
import { ghl, TAGS } from '../lib/ghl.js';
import { readBody, send, tokenFrom, fail, log, HttpError } from '../lib/http.js';
import { buyerFor } from '../lib/session.js';
import { funnelOf, SLOT_ORDER, SLOTS } from '../public/shared/map-model.js';

export function noteFor(map, link) {
  const f = funnelOf(map);
  const lines = SLOT_ORDER.filter((k) => f[k]).map((k) => `- ${SLOTS[k].label}: ${f[k].name}${f[k].price ? ` (${f[k].price})` : ''}`);
  const sig = map.offers.find((o) => o.kind === 'signature') || map.offers[0];
  return [
    'Authority Funnel Map shared by the customer',
    sig ? `Signature offer: ${sig.name}${sig.price ? ` (${sig.price})` : ''}` : '',
    lines.length ? `Funnel:\n${lines.join('\n')}` : 'Funnel: no products placed yet',
    map.summary ? `Summary: ${map.summary}` : '',
    `View the full map: ${link}`,
  ].filter(Boolean).join('\n\n');
}

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  try {
    const { buyer, store } = await buyerFor(tokenFrom(req), { env, fetchImpl });
    if (req.method === 'DELETE') {
      await store.updateBuyer(buyer.id, { share_version: (buyer.share_version || 1) + 1 });
      await store.saveMap(buyer.id, { shared_at: null });
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
    await readBody(req);
    const row = await store.getMap(buyer.id);
    if (!row?.map) throw new HttpError(400, 'Create your map first, then you can share it.');
    const link = shareLink(req, buyer, env);
    if (buyer.ghl_contact_id) {
      const api = ghl(env, fetchImpl);
      await api.addNote(buyer.ghl_contact_id, noteFor(row.map, link));
      await api.addTags(buyer.ghl_contact_id, [TAGS.shared]);
    }
    await store.saveMap(buyer.id, { shared_at: new Date().toISOString() });
    log('map_shared', {});
    return send(res, 200, { ok: true, viewLink: link });
  } catch (e) {
    return fail(res, e, 'share_error');
  }
}
