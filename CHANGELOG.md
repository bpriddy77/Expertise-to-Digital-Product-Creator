# Changelog

Semantic versioning. Versions live in `public/shared/version.js`; keep `package.json`, the `app-version` meta tag and the asset `?v=` in step.

- **APP_VERSION**: the product as a whole.
- **PROMPT_VERSION**: the AI instructions and response formats. Bump whenever a prompt or schema changes.
- **DATA_SCHEMA**: the shape of saved projects.

## [0.1.2] - 2026-10-12
### Fixed
- **"The AI request failed (404)".** Anthropic returns 404 when the API key can't use the model name requested. The tool no longer relies on fixed model names: it asks Anthropic which models the key can use (`GET /v1/models`) and picks the best available: Haiku for the quick answer check, Sonnet for everything written. Preferred: `claude-haiku-5-5` / `claude-sonnet-5-5`, then older versions, then the newest model in the right family. Models without structured-output support or that are retired are skipped. If a model still returns 404, it's skipped and the next one is tried automatically.
### Added
- **Setup check** for the owner: open `/api/ai?check=1&code=YOUR_ACCESS_CODE`. Shows whether the key works, which models are in use, and runs one tiny test call per model (a fraction of a cent).
- Clear setup messages: customers see a calm "The AI isn't available right now"; the owner sees the exact cause (key rejected, billing, permission, model unavailable, spend limit) in Vercel logs, in the setup check, and on the page with `?debug=1`. Anthropic's request ID is logged for support.
- Prices for older models in the cost meter (Sonnet 5, 4.6, 4.5; Haiku 4.5; Opus), including dated snapshots.
- `MODEL_FAST` / `MODEL_SMART` are now optional overrides used only if the key can use them.
- 6 new tests (31 total).

## [0.1.1] - 2026-10-12
### Fixed
- **Access code is now checked on the welcome screen.** Previously any code let you past Start, and the code was only checked on the first AI request. Now Start verifies the code with the server first (no AI call, no cost); a wrong code shows "That access code doesn't match" and stays on the welcome screen. Enter submits the code.
- If the code stops working mid-project (for example it was changed in Vercel), the page returns to the welcome screen to re-enter it. Progress is kept.
- The code is compared in constant time and ignores stray spaces on either side. A blank `ACCESS_CODE` means no code is required.
- 2 new tests (25 total).

## [0.1.0] - 2026-10-12
First proof of concept of DP-001, built to the original brief (workbook format only).
### Added
- Guided journey: Discover (5 example-based questions with an AI follow-up when an answer is vague), Your strength (evidence-backed suggestions to confirm, reword or reject), Preferences, Product ideas (workbooks that respect preferences), Market check (guided research, live evidence level and suggested test price), Build (outline, section-by-section writing, in-place editing, rewrite with instructions, undo), Review & export.
- Exports: workbook (.docx), print/PDF layout with ruled writing space, product summary (.docx) with strength, target customer, problem, transformation, description, test price, market evidence and launch checklist.
- Guardrails: quotes verified against the customer's answers (strengths without genuine evidence are dropped), prompt-injection protection, structured outputs, income-claim wording flagged in review, evidence levels that never claim "validated" or "profitable".
- Cost control: per-project AI limits shown to the customer; cost meter with `?debug=1`; server logs tokens and cost without customer text; optional `ACCESS_CODE`.
- Test mode (no API key) with sample responses and estimated costs; local preview server; 23 server tests and a 36-check browser test of the whole journey.
- Priddy Impact Group brand (teal, gold, Poppins), mobile-first, GoHighLevel embed support (`?embed=1`).
