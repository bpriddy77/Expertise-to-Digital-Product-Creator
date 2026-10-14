/**
 * Personal links. A buyer's link carries their id plus a signature, so it cannot be guessed or
 * altered. Bumping link_version (or share_version) in the database turns old links off.
 *   access token:  <buyerId>.<sig>         sig = HMAC(secret, "access:<id>:<version>")
 *   share token:   <buyerId>.<sig>         sig = HMAC(secret, "share:<id>:<version>")
 * The signing secret is LINK_SECRET if set, otherwise derived from GHL_WEBHOOK_SECRET.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const TEST_SECRET = 'test-mode-link-secret-not-for-production';

export function linkSecret(env = process.env) {
  const own = String(env.LINK_SECRET || '').trim();
  if (own) return own;
  const hook = String(env.GHL_WEBHOOK_SECRET || '').trim();
  if (hook) return createHmac('sha256', hook).update('authority-map-links').digest('hex');
  return TEST_SECRET;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sig = (secret, kind, id, version) => b64(createHmac('sha256', secret).update(`${kind}:${id}:${version}`).digest()).slice(0, 32);

export function makeToken(kind, buyer, env) {
  const version = kind === 'share' ? buyer.share_version : buyer.link_version;
  return `${buyer.id}.${sig(linkSecret(env), kind, buyer.id, version ?? 1)}`;
}

/** Split without trusting: returns { id, sig } or null. */
export function parseToken(token) {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/.exec(String(token || '').trim());
  return m ? { id: m[1], sig: m[2] } : null;
}

export function tokenMatches(kind, buyer, token, env) {
  const p = parseToken(token);
  if (!p || !buyer || p.id !== buyer.id) return false;
  const want = Buffer.from(makeToken(kind, buyer, env));
  const got = Buffer.from(String(token).trim());
  return want.length === got.length && timingSafeEqual(want, got);
}

export function appBaseUrl(req, env = process.env) {
  const set = String(env.APP_URL || '').trim().replace(/\/+$/, '');
  if (set) return set;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost';
  const proto = req?.headers?.['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const accessLink = (req, buyer, env) => `${appBaseUrl(req, env)}/?t=${makeToken('access', buyer, env)}`;
export const shareLink = (req, buyer, env) => `${appBaseUrl(req, env)}/?view=${makeToken('share', buyer, env)}`;

/** Constant-time comparison for the webhook secret. */
export function secretMatches(given, expected) {
  const a = Buffer.from(String(given || '').trim());
  const b = Buffer.from(String(expected || '').trim());
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
