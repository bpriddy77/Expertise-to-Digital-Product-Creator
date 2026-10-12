# DP-001 — Expertise-to-Digital-Product Creator (proof of concept)

**Version 0.1.0** (AI instructions 1.0.0, data schema 1). See `CHANGELOG.md`.

A guided, AI-assisted tool that helps a customer find expertise they're good at **and** enjoy, shape it into a product idea, check the market, and leave with an editable first version of a **workbook**, plus a product summary with a description, a starting price to test and a launch checklist.

This proof of concept answers two questions before the full build:
1. **Is the output good enough?** Does a real person end up with a workbook they'd actually sell?
2. **What does one customer cost in AI usage?** At a $7 price, this decides the limits.

## Run it

```bash
npm install
npm test            # 23 server tests (prompts, guardrails, schemas, cost, exports)
npm run dev         # http://localhost:8790, test mode: sample AI responses, no key, no cost
ANTHROPIC_API_KEY=sk-ant-... npm run dev     # live AI
```

Browser test of the full journey (needs Playwright): `python3 test/e2e.py http://localhost:8790` (36 checks).

Add `?debug=1` to the URL to show the **AI cost meter**: calls per step, tokens and dollars.

## Deploy to Vercel

1. Push this folder to GitHub and import it in Vercel. Framework preset: **Other**. Leave Build Command empty. `vercel.json` sets the output folder to `public` and the API functions.
2. Settings → Environment Variables:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | For live AI | Kept on the server only, never sent to the browser. Without it the tool runs in test mode. |
| `ACCESS_CODE` | Recommended for testing | Testers enter it once. Stops strangers spending your AI credits until paid access is built. |
| `AI_MODE` | Optional | `mock` forces test mode even with a key. |
| `MODEL_FAST` / `MODEL_SMART` | Optional | Defaults: `claude-haiku-5-5` for the quick answer check, `claude-sonnet-5-5` for everything written. |

3. Redeploy. The footer shows the version; a gold "Test mode" banner appears whenever the AI isn't live.

## The journey

| Step | What happens | AI |
|---|---|---|
| Discover | 5 questions asking for real examples. One follow-up per question if an answer is vague. | Haiku (answer check) |
| Your strength | Up to 3 strengths, each backed by **quotes from the customer's own answers**. Confirm, reword, or turn down; "Suggest different" excludes rejected ones. | Sonnet |
| Preferences | Work they enjoy, things to avoid, time per week, involvement level. | None |
| Product ideas | Up to 3 workbook ideas that respect the preferences, with "still to check" items. Chosen idea is editable. | Sonnet |
| Market check | Guided research with search links, comparable prices, real questions, interest counts. Evidence level and suggested test price update live. | None |
| Build | Outline (renamable), then each section written separately. Edit any text in place, rewrite one section with an instruction, undo a rewrite. | Sonnet |
| Review & export | Title, descriptions, who it's for, what they get, price, launch checklist (all editable). Downloads below. | Sonnet (once) |

**Exports:** workbook as Word (.docx, opens in Word, Google Docs, Pages and Canva), print or Save as PDF with ruled writing space, and the product summary as Word. The workbook uses neutral styling because it is the customer's product.

**Save and resume:** autosaves in the browser; "Save progress file" / "Open progress file" moves a project between devices.

## Guardrails (how the brief's AI rules are enforced)

| Brief rule | Enforcement |
|---|---|
| Don't invent qualifications or accomplishments | Every strength must cite quotes; the server checks each quote really appears in the customer's answers and **drops any strength without genuine evidence** (`lib/guardrails.js`, tested). |
| Distinguish ability from interest | Each strength is labeled "Shown in what you've done", "Something you enjoy" or "Done it and enjoy it". |
| Ask clarifying questions when vague | One follow-up per question when an answer has no concrete example. |
| Don't monetize every skill; respect preferences | Preferences go into the idea prompt; "things to avoid" are excluded. |
| Reject without restarting | Rejected strengths (with reasons) are passed back and not suggested again. |
| No fabricated testimonials, stats, credentials or earnings claims | In the system prompt for every call; the review screen flags income-claim wording ("passive income", "$X a month", guarantees) as the customer edits. |
| Don't call a product validated without evidence | Evidence levels only rise with real entries, and never say "validated" or "profitable" (tested). |
| Customer text can't redirect the AI | Answers are wrapped in tags with `<`/`>` neutralized, and the AI is told to treat them as information only (tested). |

AI responses use structured outputs (`output_config.format` JSON schemas in `lib/schemas.js`); a test checks every schema meets the API's rules.

## Cost control at $7

Per-project limits (`public/shared/rules.js`): 5 follow-ups, 3 strength rounds, 3 idea rounds, 2 outlines, 10 section drafts, 8 rewrites, 2 summaries. Every count is shown to the customer ("2 of 3 left"), and when one runs out they can keep editing by hand.

**Test-mode estimate:** a complete run is **16 AI calls and about $0.04** by text length. That estimate understates real usage, because sample responses are shorter than real writing. Expect a live run to cost roughly **$0.15–$0.40**, and confirm with the cost meter.

**To do during the proof of concept:** run 5–10 real people through with `?debug=1`, record the meter total for each, and set the limits from the highest. Server logs record step, model, tokens and cost for every call, never the customer's text.

**Limits are enforced in the browser for now.** A determined user could reset them. Server-side limits per customer arrive with paid access (accounts), and the `ACCESS_CODE` covers testing until then.

## Privacy

Answers stay in the customer's browser. The server forwards text to the Claude API to create suggestions and stores nothing. Before launch, review Anthropic's API data-retention terms and reflect them in the privacy note on the welcome screen and in your privacy policy.

## Versioning

`public/shared/version.js` is the single source (the server re-exports it). Bump `APP_VERSION` every build; bump `PROMPT_VERSION` whenever a prompt or schema changes; bump `DATA_SCHEMA` when the saved project format changes. Update `package.json`, the `app-version` meta tag and the `?v=` on assets in `index.html`, and add a `CHANGELOG.md` entry.

## Not in this proof of concept

Checklist, template and guide formats (next after workbooks are proven); AI-assisted market research with web search; paid access through GoHighLevel with server-side limits; branding and layout customization (EP-13); multiple products per customer (EP-14); passing the product into the Authority Funnel Revenue Calculator.

## Files

```
api/ai.js            AI endpoint (steps, access code, limits, cost)
api/export.js        Word exports
lib/prompts.js       AI instructions (server only)
lib/schemas.js       Structured output schemas
lib/guardrails.js    Quote verification and response cleanup
lib/claude.js        Claude API client (no SDK)
lib/mock.js          Test-mode responses
lib/docx-builder.js  Workbook and summary documents
lib/pricing.js       Model prices for the cost meter
public/              The page (index.html, app.js, styles.css, shared/)
scripts/dev-server.mjs  Local preview that runs the API like Vercel
test/                server.test.js (node), e2e.py (browser)
```
