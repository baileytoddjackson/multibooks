import "server-only";
import { env } from "@/lib/env";
import { utcDay, type ServerStore } from "@/lib/server-store";

/**
 * Cost guardrails for live generation. Cached content and canon reading never pass through here,
 * so they keep working when the cap is hit ("the story machine is resting").
 */
export type BudgetDenial = "daily_budget" | "session_limit";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function checkGenerationAllowed(
  store: ServerStore,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; reason: BudgetDenial }> {
  const { DAILY_BUDGET_USD, PER_SESSION_MAX_GENERATIONS } = env();
  const [spent, sessionCount] = await Promise.all([
    store.getDailySpend(utcDay()),
    store.getCounter(sessionBucket(sessionId)),
  ]);
  if (spent >= DAILY_BUDGET_USD) return { ok: false, reason: "daily_budget" };
  if (sessionCount >= PER_SESSION_MAX_GENERATIONS) return { ok: false, reason: "session_limit" };
  return { ok: true };
}

/** Counts one live generation against the session's daily allowance. */
export async function recordGeneration(store: ServerStore, sessionId: string): Promise<void> {
  await store.incrementCounter(sessionBucket(sessionId), DAY_MS);
}

function sessionBucket(sessionId: string) {
  return `gen:${utcDay()}:${sessionId}`;
}
