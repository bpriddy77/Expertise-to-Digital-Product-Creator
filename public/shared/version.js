/**
 * Versions. Bump on every build (semver).
 * APP_VERSION    — the product as a whole.
 * PROMPT_VERSION — the AI instructions and response formats. Bump whenever a prompt or
 *                  schema changes, so saved projects show which instructions produced them.
 * DATA_SCHEMA    — shape of saved project data.
 */
export const APP_VERSION = '0.1.2';
export const PROMPT_VERSION = '1.0.0';
export const DATA_SCHEMA = 1;
export const BUILD_DATE = '2026-10-12';
