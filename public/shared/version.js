/**
 * Versions. Bump on every build (semver).
 * APP_VERSION    — the product as a whole.
 * PROMPT_VERSION — the AI instructions and response formats. Bump whenever a prompt or
 *                  schema changes, so saved maps show which instructions produced them.
 * DATA_SCHEMA    — shape of saved map data (see map-model.js).
 */
export const APP_VERSION = '0.6.0';
export const PROMPT_VERSION = '2.0.0';
export const DATA_SCHEMA = 'opportunity-map/2';
export const BUILD_DATE = '2026-10-14';
