import "server-only";
import { env } from "@/lib/env";
import { utcDay, type ServerStore } from "@/lib/server-store";
import { checkRateLimit, clientIp, hashIp } from "./rateLimit";
import { evaluateBudget, type GuardResult } from "./policy";

/**
 * Cost guardrails for live generation. Cached content and canon reading never pass through here,
 * so they keep working when a cap is hit ("the story machine is resting").
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function sessionBucket(sessionId: string, day = utcDay()) {
  return `gen:${day}:${sessionId}`;
}

/** Salted, daily-rotating hash of the caller's IP (the raw IP is never stored). */
export function ipHashFor(headers: Headers): string {
  return hashIp(clientIp(headers), env().APP_SECRET, utcDay());
}

/**
 * Runs every check a new generation needs, cheapest first: daily budget, per-session daily cap,
 * then per-minute rate limits. Call right before generating (after cache lookups).
 */
export async function guardGeneration(
  store: ServerStore,
  ids: { sessionId: string; ipHash: string },
): Promise<GuardResult> {
  const e = env();
  const [spent, sessionCount] = await Promise.all([
    store.getDailySpend(utcDay()),
    store.getCounter(sessionBucket(ids.sessionId)),
  ]);
  const budget = evaluateBudget(
    { spentTodayUsd: spent, sessionGenerationsToday: sessionCount },
    { dailyBudgetUsd: e.DAILY_BUDGET_USD, perSessionMaxGenerations: e.PER_SESSION_MAX_GENERATIONS },
  );
  if (!budget.ok) return budget;
  const rl = await checkRateLimit(store, ids, {
    perSessionPerMinute: e.RATE_LIMIT_SESSION_PER_MINUTE,
    perIpPerMinute: e.RATE_LIMIT_IP_PER_MINUTE,
  });
  if (!rl.ok) return { ok: false, reason: "rate_limited", retryAfterSec: rl.retryAfterSec };
  return { ok: true };
}

/** Counts one live generation against the session's daily allowance. */
export async function recordGeneration(store: ServerStore, sessionId: string): Promise<void> {
  await store.incrementCounter(sessionBucket(sessionId), DAY_MS);
}

export type { GuardResult, GuardDenial } from "./policy";
