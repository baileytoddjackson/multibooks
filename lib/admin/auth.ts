import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/auth/crypto";

/** Admin session cookie: "<expiresAtMs>.<hmac>", signed with APP_SECRET. No user data inside. */
export const ADMIN_COOKIE = "mb_admin";
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function passwordMatches(given: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return safeEqual(given, expected);
}

export function createAdminToken(secret: string, now = Date.now()): string {
  const exp = String(now + ADMIN_SESSION_MS);
  return `${exp}.${sign(exp, secret)}`;
}

export function verifyAdminToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < now) return false;
  return safeEqual(mac, sign(exp, secret));
}
