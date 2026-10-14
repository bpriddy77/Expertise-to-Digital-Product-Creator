/**
 * Owner setup check:  GET /api/check?key=<GHL_WEBHOOK_SECRET>[&contact=<a test contact id>]
 * Reports whether each connection works, without showing any secret.
 */
import { callClaude } from '../lib/claude.js';
import { resolveModels } from '../lib/models.js';
import { getStore, storeMode } from '../lib/store.js';
import { ghl, LINK_FIELD_KEY } from '../lib/ghl.js';
import { secretMatches } from '../lib/links.js';
import { send, query, fail, HttpError } from '../lib/http.js';
import { aiMode } from './ai.js';
import { APP_VERSION, PROMPT_VERSION } from '../lib/version.js';

const set = (v) => Boolean(String(v || '').trim());

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  try {
    const q = query(req);
    if (!set(env.GHL_WEBHOOK_SECRET)) throw new HttpError(503, 'Set GHL_WEBHOOK_SECRET in Vercel first.');
    if (!secretMatches(q.get('key'), env.GHL_WEBHOOK_SECRET)) throw new HttpError(401, 'Add ?key=YOUR_GHL_WEBHOOK_SECRET to the address.');

    const out = {
      appVersion: APP_VERSION, promptVersion: PROMPT_VERSION,
      settings: {
        ANTHROPIC_API_KEY: set(env.ANTHROPIC_API_KEY), SUPABASE_URL: set(env.SUPABASE_URL), SUPABASE_SECRET_KEY: set(env.SUPABASE_SECRET_KEY),
        GHL_PRIVATE_TOKEN: set(env.GHL_PRIVATE_TOKEN), GHL_LOCATION_ID: set(env.GHL_LOCATION_ID), GHL_WEBHOOK_SECRET: true,
        CRON_SECRET: set(env.CRON_SECRET), APP_URL: env.APP_URL || '(uses the address the page is opened from)',
      },
      linkField: `{{contact.${LINK_FIELD_KEY(env)}}}`,
    };

    // AI
    out.ai = { mode: aiMode(env) };
    if (out.ai.mode === 'live') {
      try {
        const m = await resolveModels({ apiKey: env.ANTHROPIC_API_KEY.trim(), env, fetchImpl });
        const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
        const r = await callClaude({ apiKey: env.ANTHROPIC_API_KEY.trim(), model: m.fast, system: 'Reply with JSON.', messages: [{ role: 'user', content: 'Say ok.' }], schema, maxTokens: 50, fetchImpl });
        Object.assign(out.ai, { ok: r.data?.ok === true, fast: m.fast, smart: m.smart });
      } catch (e) { Object.assign(out.ai, { ok: false, problem: e.detail || e.message }); }
    }

    // Database
    out.database = { mode: storeMode(env) };
    try { await getStore(env, fetchImpl).ping(); out.database.ok = true; } catch (e) { Object.assign(out.database, { ok: false, problem: e.detail || e.message }); }

    // HighLevel
    const api = ghl(env, fetchImpl);
    out.highlevel = { mode: api.live ? 'live' : 'test' };
    const contact = q.get('contact');
    if (api.live && contact) {
      try { const c = await api.getContact(contact); out.highlevel.ok = Boolean(c?.contact?.id || c?.id); out.highlevel.contactFound = out.highlevel.ok; } catch (e) { Object.assign(out.highlevel, { ok: false, problem: e.detail || e.message }); }
    } else if (api.live) {
      out.highlevel.note = 'Add &contact=<a test contact id> to also test the HighLevel token.';
    }

    out.ok = (out.ai.ok !== false) && out.database.ok && out.highlevel.ok !== false;
    return send(res, 200, out);
  } catch (e) {
    return fail(res, e, 'check_error');
  }
}
