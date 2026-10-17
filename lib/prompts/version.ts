/**
 * Bump whenever a runtime prompt changes in a way that should regenerate cached detours.
 * Old cache entries stay in the database but are never read again.
 */
// v2: never decide characters' fates; match the original's tense from character perspectives.
export const PROMPT_VERSION = 2;
