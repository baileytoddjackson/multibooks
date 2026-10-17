import { createHash } from "node:crypto";
import type { ServerStore } from "@/lib/server-store/ServerStore";

/**
 * Per-minute limits on *new generations* (cache hits and canon reading are never limited).
 *
 * Two buckets, because a whole classroom usually shares one public IP:
 * - per session: tight, so one reader can't hammer the button;
 * - per IP: generous, only a backstop against scripted abuse (sessions are client-made ids).
 * The daily budget cap remains the hard ceiling either way.
 */
export interface RateLimits {
  perSessionPerMinute: number;
  perIpPerMinute: number;
}

export type RateLimitResult =
  { ok: true } | { ok: false; retryAfterSec: number; scope: "session" | "ip" };

const MINUTE_MS = 60_000;

/** IPs are never stored: only a salted hash that changes daily. */
export function hashIp(ip: string, secret: string, day: string): string {
  return createHash("sha256").update(`${secret}:${day}:${ip}`).digest("hex").slice(0, 32);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export async function checkRateLimit(
  store: Pick<ServerStore, "incrementCounter">,
  ids: { sessionId: string; ipHash: string },
  limits: RateLimits,
  now = Date.now(),
): Promise<RateLimitResult> {
  const minute = Math.floor(now / MINUTE_MS);
  const retryAfterSec = Math.ceil(((minute + 1) * MINUTE_MS - now) / 1000);
  const [session, ip] = await Promise.all([
    store.incrementCounter(`rl:s:${minute}:${ids.sessionId}`, MINUTE_MS * 2),
    store.incrementCounter(`rl:ip:${minute}:${ids.ipHash}`, MINUTE_MS * 2),
  ]);
  if (session > limits.perSessionPerMinute) return { ok: false, retryAfterSec, scope: "session" };
  if (ip > limits.perIpPerMinute) return { ok: false, retryAfterSec, scope: "ip" };
  return { ok: true };
}
