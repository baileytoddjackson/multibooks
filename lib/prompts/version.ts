/**
 * Bump whenever a runtime prompt changes in a way that should regenerate cached detours.
 * Old cache entries stay in the database but are never read again.
 */
export const PROMPT_VERSION = 1;
