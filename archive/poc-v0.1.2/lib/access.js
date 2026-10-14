/**
 * Access-code check shared by the API functions.
 * Constant-time comparison; surrounding spaces are ignored on both sides
 * (a stray space pasted into Vercel or typed by a tester shouldn't lock anyone out).
 */
import { timingSafeEqual, createHash } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s ?? '').trim()).digest();

export function accessRequired(env = process.env) {
  return String(env.ACCESS_CODE ?? '').trim() !== '';
}

export function accessOk(req, env = process.env) {
  if (!accessRequired(env)) return true;
  const given = req.headers?.['x-access-code'];
  if (typeof given !== 'string' || given.trim() === '') return false;
  return timingSafeEqual(digest(given), digest(env.ACCESS_CODE));
}
