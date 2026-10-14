/**
 * HighLevel (LeadConnector API v2) calls, using a Private Integration token.
 * Needs scopes: contacts.readonly, contacts.write.
 *   setLinkField(contactId, link)  writes the buyer's personal link into the contact field
 *   addTags(contactId, tags)       adds tags without removing existing ones
 *   addNote(contactId, text)       adds a note (used when a buyer shares their map)
 * Test mode (no GHL_PRIVATE_TOKEN): calls are recorded in memory instead of sent.
 */
const API = 'https://services.leadconnectorhq.com';

export class GhlError extends Error {
  constructor(message, detail = '') { super(message); this.status = 502; this.detail = detail; }
}

export const ghlMode = (env = process.env) => (String(env.GHL_PRIVATE_TOKEN || '').trim() ? 'live' : 'test');
export const sent = []; // test mode record
export const LINK_FIELD_KEY = (env = process.env) => String(env.GHL_LINK_FIELD_KEY || 'authority_map_link').trim().replace(/^contact\./, '');
export const TAGS = Object.freeze({ buyer: 'authority-map-buyer', resend: 'authority-map-resend-link', shared: 'authority-map-shared' });

export function ghl(env = process.env, fetchImpl = fetch) {
  const token = String(env.GHL_PRIVATE_TOKEN || '').trim();
  const version = String(env.GHL_API_VERSION || '2021-07-28').trim();
  const live = Boolean(token);
  async function req(path, { method = 'GET', body } = {}) {
    if (!live) { sent.push({ method, path, body }); return { ok: true, test: true }; }
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, version, accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new GhlError('Could not reach HighLevel.', e.message);
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const hint = res.status === 401 ? ' Check GHL_PRIVATE_TOKEN.' : res.status === 403 ? ' The Private Integration needs the contacts.readonly and contacts.write scopes.' : '';
      throw new GhlError('HighLevel rejected the request.', `HighLevel ${res.status} on ${method} ${path.split('?')[0]}: ${JSON.stringify(data)?.slice(0, 300)}${hint}`);
    }
    return data;
  }
  return {
    live,
    async setLinkField(contactId, link) {
      const key = LINK_FIELD_KEY(env);
      const path = `/contacts/${encodeURIComponent(contactId)}`;
      try {
        return await req(path, { method: 'PUT', body: { customFields: [{ key, field_value: link }] } });
      } catch (e) {
        // Some API versions name the value "fieldValue"; try once more before giving up.
        if (e instanceof GhlError && /HighLevel 4\d\d/.test(e.detail) && !/ 401 | 403 /.test(e.detail)) {
          return req(path, { method: 'PUT', body: { customFields: [{ key, fieldValue: link }] } });
        }
        throw e;
      }
    },
    addTags(contactId, tags) { return req(`/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'POST', body: { tags } }); },
    addNote(contactId, text) { return req(`/contacts/${encodeURIComponent(contactId)}/notes`, { method: 'POST', body: { body: text } }); },
    getContact(contactId) { return req(`/contacts/${encodeURIComponent(contactId)}`); },
  };
}

/**
 * Pull the buyer out of a HighLevel workflow webhook. HighLevel's standard webhook sends contact
 * fields at the top level; custom data may appear at the top level or under customData.
 */
export function buyerFromWebhook(body = {}) {
  const cd = body.customData || body.custom_data || {};
  const pick = (...keys) => {
    for (const k of keys) {
      const v = cd[k] ?? body[k] ?? body.contact?.[k];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
    return '';
  };
  return {
    ghlContactId: pick('contact_id', 'contactId', 'id'),
    email: pick('email').toLowerCase(),
    firstName: pick('first_name', 'firstName'),
  };
}
