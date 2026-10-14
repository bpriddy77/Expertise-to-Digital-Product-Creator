/**
 * Storage for buyers and their maps.
 * - Live: Supabase through its REST API, using the secret key (server only; RLS is on with no
 *   policies, so nothing in the browser can read the tables).
 * - Test mode (no SUPABASE_URL): an in-memory store, so the app and tests run without a database.
 *
 * Tables (see supabase/schema.sql):
 *   buyers(id, ghl_contact_id, email, first_name, link_version, share_version, ai_calls, map_generations, created_at, last_seen_at)
 *   maps(buyer_id, answers, map, progress, shared_at, updated_at)
 */
import { randomUUID } from 'node:crypto';

export class StoreError extends Error {
  constructor(message, detail = '') { super(message); this.status = 503; this.detail = detail; }
}

const env0 = () => process.env;
export const storeMode = (env = env0()) => (String(env.SUPABASE_URL || '').trim() && String(env.SUPABASE_SECRET_KEY || '').trim() ? 'supabase' : 'memory');

/* ---------- In-memory store (test mode) ---------- */
const mem = { buyers: new Map(), maps: new Map() };
export function resetMemoryStore() { mem.buyers.clear(); mem.maps.clear(); }

const memory = {
  async upsertBuyer({ ghlContactId, email, firstName }) {
    let b = [...mem.buyers.values()].find((x) => (ghlContactId && x.ghl_contact_id === ghlContactId) || (!ghlContactId && email && x.email === email));
    const created = !b;
    if (!b) {
      b = { id: randomUUID(), ghl_contact_id: ghlContactId || null, email: email || null, first_name: firstName || null, link_version: 1, share_version: 1, ai_calls: 0, map_generations: 0, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString() };
      mem.buyers.set(b.id, b);
    } else {
      Object.assign(b, { email: email || b.email, first_name: firstName || b.first_name });
    }
    return { buyer: { ...b }, created };
  },
  async getBuyer(id) { const b = mem.buyers.get(id); return b ? { ...b } : null; },
  async findBuyerByEmail(email) { const b = [...mem.buyers.values()].find((x) => x.email && x.email.toLowerCase() === String(email).toLowerCase()); return b ? { ...b } : null; },
  async updateBuyer(id, patch) { const b = mem.buyers.get(id); if (b) Object.assign(b, patch); return b ? { ...b } : null; },
  async getMap(buyerId) { const m = mem.maps.get(buyerId); return m ? JSON.parse(JSON.stringify(m)) : null; },
  async saveMap(buyerId, patch) {
    const cur = mem.maps.get(buyerId) || { buyer_id: buyerId, answers: {}, map: null, progress: null, shared_at: null };
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    mem.maps.set(buyerId, JSON.parse(JSON.stringify(next)));
    return next;
  },
  async deleteBuyer(id) { mem.maps.delete(id); return mem.buyers.delete(id); },
  async deleteInactiveSince(iso) {
    let n = 0;
    for (const b of [...mem.buyers.values()]) if (b.last_seen_at < iso) { mem.maps.delete(b.id); mem.buyers.delete(b.id); n++; }
    return n;
  },
  async ping() { return true; },
};

/* ---------- Supabase REST ---------- */
function supabase(env, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL).trim().replace(/\/+$/, '') + '/rest/v1';
  const key = String(env.SUPABASE_SECRET_KEY).trim();
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`; // legacy service_role JWT
  async function req(path, { method = 'GET', body, prefer } = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers: { ...headers, ...(prefer ? { prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new StoreError('Saving is not available right now. Try again in a moment.', `Supabase unreachable: ${e.message}`);
    }
    if (!res.ok) {
      let msg = '';
      try { msg = JSON.stringify(await res.json()); } catch { /* ignore */ }
      const hint = res.status === 401 || res.status === 403 ? ' Check SUPABASE_SECRET_KEY.' : res.status === 404 ? ' Run supabase/schema.sql in the Supabase SQL editor.' : '';
      throw new StoreError('Saving is not available right now. Try again in a moment.', `Supabase ${res.status} on ${method} ${path.split('?')[0]}: ${msg}${hint}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const one = (rows) => (Array.isArray(rows) ? rows[0] || null : rows);
  const enc = encodeURIComponent;
  return {
    async upsertBuyer({ ghlContactId, email, firstName }) {
      const existing = ghlContactId
        ? one(await req(`/buyers?ghl_contact_id=eq.${enc(ghlContactId)}&select=*`))
        : one(await req(`/buyers?email=eq.${enc(email)}&ghl_contact_id=is.null&select=*`));
      if (existing) {
        const patch = {};
        if (email && email !== existing.email) patch.email = email;
        if (firstName && firstName !== existing.first_name) patch.first_name = firstName;
        const b = Object.keys(patch).length ? one(await req(`/buyers?id=eq.${existing.id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' })) : existing;
        return { buyer: b, created: false };
      }
      const b = one(await req('/buyers?on_conflict=ghl_contact_id', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=representation',
        body: { ghl_contact_id: ghlContactId || null, email: email || null, first_name: firstName || null },
      }));
      return { buyer: b, created: true };
    },
    async getBuyer(id) { return one(await req(`/buyers?id=eq.${enc(id)}&select=*`)); },
    async findBuyerByEmail(email) { return one(await req(`/buyers?email=ilike.${enc(String(email).replace(/[%_]/g, ''))}&select=*&order=created_at.desc&limit=1`)); },
    async updateBuyer(id, patch) { return one(await req(`/buyers?id=eq.${enc(id)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' })); },
    async getMap(buyerId) { return one(await req(`/maps?buyer_id=eq.${enc(buyerId)}&select=*`)); },
    async saveMap(buyerId, patch) {
      return one(await req('/maps?on_conflict=buyer_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: { buyer_id: buyerId, ...patch, updated_at: new Date().toISOString() } }));
    },
    async deleteBuyer(id) { await req(`/buyers?id=eq.${enc(id)}`, { method: 'DELETE' }); return true; },
    async deleteInactiveSince(iso) {
      const rows = await req(`/buyers?last_seen_at=lt.${enc(iso)}`, { method: 'DELETE', prefer: 'return=representation' });
      return Array.isArray(rows) ? rows.length : 0;
    },
    async ping() { await req('/buyers?select=id&limit=1'); return true; },
  };
}

export function getStore(env = env0(), fetchImpl) {
  return storeMode(env) === 'supabase' ? supabase(env, fetchImpl) : memory;
}
