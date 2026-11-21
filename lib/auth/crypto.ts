import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison that doesn't leak the length either. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ab.length === bb.length;
}

/** A random, URL-safe token (256 bits by default). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Session tokens are stored hashed, so a leaked database can't be used to sign in. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** True when the request arrived over HTTPS (always on Vercel; not plain-http localhost). */
export function isHttps(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}
