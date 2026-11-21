import { safeEqual } from "./crypto";

/** Codes are compared case-insensitively and ignoring surrounding spaces (they get typed in). */
export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * True when `given` matches the configured sign-up code. With no code configured, sign-up is
 * closed (fails safe rather than open).
 */
export function accessCodeMatches(given: string, expected: string | undefined): boolean {
  if (!expected?.trim()) return false;
  return safeEqual(normalizeAccessCode(given), normalizeAccessCode(expected));
}
