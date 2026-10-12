# Changelog

Semantic versioning. Versions live in `public/shared/version.js`; keep `package.json`, the `app-version` meta tag and the asset `?v=` in step.

- **APP_VERSION**: the product as a whole.
- **PROMPT_VERSION**: the AI instructions and response formats. Bump whenever a prompt or schema changes.
- **DATA_SCHEMA**: the shape of saved projects.

## [0.1.0] - 2026-10-12
First proof of concept of DP-001, built to the original brief (workbook format only).
### Added
- Guided journey: Discover (5 example-based questions with an AI follow-up when an answer is vague), Your strength (evidence-backed suggestions to confirm, reword or reject), Preferences, Product ideas (workbooks that respect preferences), Market check (guided research, live evidence level and suggested test price), Build (outline, section-by-section writing, in-place editing, rewrite with instructions, undo), Review & export.
- Exports: workbook (.docx), print/PDF layout with ruled writing space, product summary (.docx) with strength, target customer, problem, transformation, description, test price, market evidence and launch checklist.
- Guardrails: quotes verified against the customer's answers (strengths without genuine evidence are dropped), prompt-injection protection, structured outputs, income-claim wording flagged in review, evidence levels that never claim "validated" or "profitable".
- Cost control: per-project AI limits shown to the customer; cost meter with `?debug=1`; server logs tokens and cost without customer text; optional `ACCESS_CODE`.
- Test mode (no API key) with sample responses and estimated costs; local preview server; 23 server tests and a 36-check browser test of the whole journey.
- Priddy Impact Group brand (teal, gold, Poppins), mobile-first, GoHighLevel embed support (`?embed=1`).
