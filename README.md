# Authority Funnel Map (DP-001) v0.6.0

Priddy Impact Group's $9 app. An established business owner answers a short guided interview and gets their **Authority Funnel Map**: one to five digital products (main product, order bump, upsell, downsell, one-time offer), built from what they already have, leading to their signature offer. Everything on the map can be edited, priced, exported and shared.

Earlier proof of concept (v0.1.2, workbook builder) is kept in `archive/poc-v0.1.2/` and is no longer deployed.

---

## How it fits together

```
Buyer pays $9 in HighLevel
  → HighLevel workflow calls  /api/purchase?key=…   (creates the buyer, writes their personal link
                                                      into the contact field "Authority Map Link")
  → HighLevel emails the link  {{contact.authority_map_link}}
Buyer opens the link → interview → map  (saved to Supabase, works on any device)
Buyer clicks "Send to Priddy Impact Group" → note + tag on their HighLevel contact
Every day at 08:17 UTC → /api/cleanup deletes data inactive for 12 months
```

| Piece | Where |
|---|---|
| Pages | `public/` (index.html, app.js, map-view.js, app.css, map.css) |
| Questions | `public/shared/interview.js` |
| Map format and rules | `public/shared/map-model.js` (schema `opportunity-map/2`) |
| Buyer-facing links (booking, course, calculator, support email) | `public/shared/config.js` |
| AI instructions | `lib/prompts.js`, response formats `lib/schemas.js`, safety checks `lib/guardrails.js` |
| Server endpoints | `api/` (ai, me, purchase, share, resend, cleanup, check) |
| Database setup | `supabase/schema.sql` |
| Approved design prototype | `prototype/` (not deployed) |

---

## Setup for Britt (one time)

You already created the Supabase project, the HighLevel product, the custom field, the Private Integration token, and five Vercel variables. Remaining steps:

### 1. Create the database tables
Supabase → your project → **SQL Editor** → **New query** → paste everything in `supabase/schema.sql` → **Run**. It should say "Success. No rows returned." Running it twice is harmless.

### 2. Add two more Vercel variables
Vercel → project → **Settings → Environment Variables** (mark both **Sensitive**):

| Name | Value |
|---|---|
| `CRON_SECRET` | another long random password (30+ characters). Vercel uses it to run the daily clean-up. |
| `APP_URL` | the app's public address, e.g. `https://your-project.vercel.app` or your custom domain (no slash at the end). Links in emails use this. |

You can delete the old `ACCESS_CODE` variable; it is no longer used.

### 3. Deploy
Replace the repository contents with this version (keep `.git`), commit and push. Vercel deploys automatically. Then **Redeploy** once from the Vercel dashboard so the new variables are picked up.

### 4. Run the setup check
Open: `https://YOUR-APP/api/check?key=YOUR_GHL_WEBHOOK_SECRET&contact=A_TEST_CONTACT_ID`
(a contact ID is in the address bar when you open a contact in HighLevel). You want `"ok": true`, with `ai.ok`, `database.ok` and `highlevel.ok` all `true`. If not, the `problem` line says what to fix.

### 5. HighLevel workflow 1: purchase → link email
Automation → Workflows → **Create workflow** → Start from scratch. Name: *Authority Funnel Map: send link*.
1. **Trigger: Order Submitted.** Filter: product is *Authority Funnel Map*. (This trigger also fires for upsells and bumps; the product filter keeps it to this purchase, and the app never creates duplicates.)
2. **Action: Webhook.** Method POST. URL: `https://YOUR-APP/api/purchase?key=YOUR_GHL_WEBHOOK_SECRET`. Under **Custom data** add:
   - `contact_id` = `{{contact.id}}`
   - `email` = `{{contact.email}}`
   - `first_name` = `{{contact.first_name}}`
3. **Action: Wait** 1 minute (gives the app time to write the link).
4. **Action: Send email.** Suggested subject: *Your Authority Funnel Map is ready to start*. Body must include the button or link `{{contact.authority_map_link}}`. Suggested text: "Use this personal link to start (and come back to) your Authority Funnel Map. It saves as you go and works on any device. Please don't share it: it opens your private answers."
5. Publish.

### 6. HighLevel workflow 2: "email me my link"
Trigger **Contact Tag added**: `authority-map-resend-link` → **Send email** (same email as above) → **Remove contact tag** `authority-map-resend-link`. Publish.

### 7. Optional workflow 3: tell Malissa when a map is shared
Trigger **Contact Tag added**: `authority-map-shared` → **Internal notification** to Malissa ("{{contact.name}} shared their Authority Funnel Map. See the contact's notes for the summary and link."). The map summary and a read-only link are already added as a note on the contact.

### 8. Fill in buyer-facing links
Edit `public/shared/config.js`: `bookingUrl` (HighLevel calendar), `courseUrl` ($47 course), `calculatorUrl` ($17 calculator), `supportEmail`. Empty values simply hide that button. Commit and push.

### 9. Test purchase
Buy the product with a 100% coupon (or HighLevel test mode). You should receive the email; the link opens the welcome screen; answer a few questions, close the tab, reopen the link on your phone, and continue where you left off.

---

## Environment variables

| Name | Needed | What it is |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude API key (secret) |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | yes | Supabase secret key (`sb_secret_…` or legacy `service_role`) (secret) |
| `GHL_PRIVATE_TOKEN` | yes | HighLevel Private Integration token, scopes `contacts.readonly` + `contacts.write` (secret) |
| `GHL_LOCATION_ID` | yes | HighLevel sub-account (location) ID |
| `GHL_WEBHOOK_SECRET` | yes | long random password; in the webhook URL, the setup check, and used to sign personal links (secret) |
| `CRON_SECRET` | yes | long random password for the daily clean-up (secret) |
| `APP_URL` | recommended | public address used in emailed links |
| `LINK_SECRET` | optional | separate signing secret for links (otherwise derived from `GHL_WEBHOOK_SECRET`). Changing it turns off every existing link. |
| `GHL_LINK_FIELD_KEY` | optional | custom field key if not `authority_map_link` |
| `AI_CALL_LIMIT` / `MAP_LIMIT` | optional | per-buyer limits (defaults 120 AI calls, 8 fresh maps) |
| `RETENTION_MONTHS` | optional | default 12 |
| `MODEL_FAST` / `MODEL_SMART` | optional | model overrides; otherwise picked automatically from what the key can use |

Never put any of these in the code, the repository or a chat. They belong only in Vercel.

---

## Privacy and data

- Stored per buyer: HighLevel contact ID, email, first name, interview answers, the map, usage counts and dates. Nothing else.
- Tables are locked (row level security, no policies); only the server can read them. Customer text is never written to logs.
- Data is deleted automatically after 12 months without a visit, or at once with **Delete my data** at the bottom of the map.
- Priddy Impact Group sees a map only if the buyer clicks **Send to Priddy Impact Group**. They can stop sharing at any time; the old view link then stops working.
- Turning off a buyer's link: in Supabase, Table Editor → `buyers` → raise `link_version` by 1. Their next "email me my link" request sends a new one.

## AI behaviour

- **Interview** (fast model): after each answer, at most one follow-up when something important is missing, plus examples for the next question tailored to their kind of business. If the AI is unavailable, the interview simply continues.
- **Map** (smart model): products only from what the owner said; facts must quote their words (otherwise shown as assumptions); prices clamped to published ranges per position; income-claim wording removed; result validated before it is shown.
- Typical cost per buyer: well under $1 (about 13 short Haiku calls plus one or two Sonnet maps).

## Local preview and tests

```
npm run dev                      # http://localhost:8790/?demo=1  (test mode, no keys)
npm test                         # server tests (node)
PORT=8791 npm run dev & python3 test/app-e2e.py     # full browser journey (Playwright)
cd prototype && node --test test/ && python3 build.py && python3 test/map-e2e.py   # approved map prototype
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Email arrives without a link | The workflow's Wait step is missing, or the field key differs. Check the setup check's `linkField` and the contact's *Authority Map Link* field. |
| "This link is not valid" | Link was copied incompletely, `GHL_WEBHOOK_SECRET`/`LINK_SECRET` changed, or the buyer deleted their data. Use "Email me my link". |
| "Saving is not available right now" | Database problem: run the setup check; usually `schema.sql` not run or a wrong `SUPABASE_SECRET_KEY`. |
| Webhook shows 401 in HighLevel | The `key=` in the webhook URL doesn't match `GHL_WEBHOOK_SECRET`. |
| HighLevel 403 in the setup check | The Private Integration needs `contacts.readonly` and `contacts.write`. |
| Map creation fails | Open the page with `?debug=1` to see the cause, or check Vercel logs (`ai_error:map`). |
