/**
 * The buyer's saved work. Header x-map-token: their link token.
 *   GET    /api/me                 → { ok, buyer, state }       (also marks them active today)
 *   GET    /api/me?view=<share>    → { ok, map } read-only view of a map its owner shared
 *   GET    /api/me?demo=1          → { ok, token } test mode only (no database connected)
 *   PUT    /api/me  { answers?, map?, progress? }  → { ok, savedAt }
 *   DELETE /api/me  { confirm: "DELETE" }          → { ok } deletes the buyer and their map
 */
import { getStore } from '../lib/store.js';
import { parseToken, tokenMatches, makeToken } from '../lib/links.js';
import { readBody, send, query, tokenFrom, fail, log, HttpError } from '../lib/http.js';
import { buyerFor, demoAllowed } from '../lib/session.js';
import { validateMap, AOV_GOALS } from '../public/shared/map-model.js';
import { QUESTIONS, LIMITS_INTERVIEW } from '../public/shared/interview.js';
import { APP_VERSION, PROMPT_VERSION } from '../lib/version.js';

/** Keep only known questions and cap lengths, so stored answers stay small and predictable. */
export function cleanAnswers(input = {}) {
  const out = {};
  for (const q of QUESTIONS) {
    const a = input[q.id];
    if (!a || typeof a !== 'object') continue;
    out[q.id] = {
      answer: String(a.answer || '').slice(0, LIMITS_INTERVIEW.answer),
      followUpQuestion: String(a.followUpQuestion || '').slice(0, 300),
      followUpAnswer: String(a.followUpAnswer || '').slice(0, LIMITS_INTERVIEW.followUp),
      followUpExamples: (Array.isArray(a.followUpExamples) ? a.followUpExamples : []).map((x) => String(x).slice(0, 200)).slice(0, 3),
      skipped: Boolean(a.skipped),
      checked: Boolean(a.checked),
    };
  }
  return out;
}

function cleanProgress(p = {}) {
  return {
    index: Math.max(0, Math.min(QUESTIONS.length, parseInt(p.index, 10) || 0)),
    phase: ['intro', 'interview', 'review', 'map'].includes(p.phase) ? p.phase : 'interview',
    goal: AOV_GOALS.includes(Number(p.goal)) ? Number(p.goal) : 100,
  };
}

export default async function handler(req, res, { env = process.env, fetchImpl } = {}) {
  try {
    const q = query(req);
    if (req.method === 'GET' && q.get('view')) {
      const token = q.get('view');
      const p = parseToken(token);
      const store = getStore(env, fetchImpl);
      const buyer = p ? await store.getBuyer(p.id) : null;
      const row = buyer && tokenMatches('share', buyer, token, env) ? await store.getMap(buyer.id) : null;
      if (!row?.map || !row.shared_at) throw new HttpError(404, 'This shared map is not available. The owner may have stopped sharing it or deleted it.');
      return send(res, 200, { ok: true, map: row.map, sharedAt: row.shared_at });
    }

    if (req.method === 'GET' && q.get('demo')) {
      if (!demoAllowed(env)) throw new HttpError(404, 'Not found.');
      const store = getStore(env, fetchImpl);
      const { buyer } = await store.upsertBuyer({ ghlContactId: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, email: '', firstName: 'Demo' });
      return send(res, 200, { ok: true, token: makeToken('access', buyer, env) });
    }

    const { buyer, store } = await buyerFor(tokenFrom(req), { env, fetchImpl, touch: req.method === 'GET' });

    if (req.method === 'GET') {
      const row = await store.getMap(buyer.id);
      return send(res, 200, {
        ok: true,
        buyer: { firstName: buyer.first_name || '', aiCalls: buyer.ai_calls || 0, mapsMade: buyer.map_generations || 0 },
        state: row ? { answers: row.answers || {}, map: row.map || null, progress: row.progress || null, sharedAt: row.shared_at || null, updatedAt: row.updated_at } : null,
        versions: { app: APP_VERSION, prompt: PROMPT_VERSION },
      });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const patch = {};
      if (body.answers !== undefined) patch.answers = cleanAnswers(body.answers);
      if (body.progress !== undefined) patch.progress = cleanProgress(body.progress);
      if (body.map !== undefined) {
        if (body.map === null) patch.map = null;
        else {
          const v = validateMap(body.map);
          if (!v.ok) throw new HttpError(400, 'Your map could not be saved because something important is missing.', v.errors.join(' '));
          patch.map = v.map;
        }
      }
      if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to save.');
      const row = await store.saveMap(buyer.id, patch);
      return send(res, 200, { ok: true, savedAt: row?.updated_at || new Date().toISOString() });
    }

    if (req.method === 'DELETE') {
      const body = await readBody(req);
      if (body.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
      await store.deleteBuyer(buyer.id);
      log('buyer_deleted', {});
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (e) {
    return fail(res, e, 'me_error');
  }
}
