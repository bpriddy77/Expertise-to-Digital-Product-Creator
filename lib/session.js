/** Resolve the buyer for a request from their personal link token. */
import { getStore } from './store.js';
import { parseToken, tokenMatches } from './links.js';
import { HttpError } from './http.js';

export async function buyerFor(token, { env = process.env, fetchImpl, touch = false } = {}) {
  const p = parseToken(token);
  if (!p) throw new HttpError(401, 'This link is not valid. Use the link from your purchase email, or ask for a new one.');
  const store = getStore(env, fetchImpl);
  const buyer = await store.getBuyer(p.id);
  if (!buyer || !tokenMatches('access', buyer, token, env)) {
    throw new HttpError(401, 'This link is not valid any more. Ask for a new one below and we will email it to you.');
  }
  if (touch) {
    const today = new Date().toISOString().slice(0, 10);
    if (String(buyer.last_seen_at || '').slice(0, 10) !== today) await store.updateBuyer(buyer.id, { last_seen_at: new Date().toISOString() });
  }
  return { buyer, store };
}

/** Test/demo mode only: never available once a database is connected. */
export function demoAllowed(env = process.env) {
  const noDb = !(String(env.SUPABASE_URL || '').trim() && String(env.SUPABASE_SECRET_KEY || '').trim());
  const noAi = env.AI_MODE === 'mock' || !String(env.ANTHROPIC_API_KEY || '').trim();
  return noDb && (noAi || env.ALLOW_DEMO === '1');
}
