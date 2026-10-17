/** Pure budget decisions (no I/O), so the rules are easy to test. */

export type GuardDenial = "daily_budget" | "session_limit" | "rate_limited";

export type GuardResult = { ok: true } | { ok: false; reason: GuardDenial; retryAfterSec?: number };

export function evaluateBudget(
  usage: { spentTodayUsd: number; sessionGenerationsToday: number },
  limits: { dailyBudgetUsd: number; perSessionMaxGenerations: number },
): GuardResult {
  if (usage.spentTodayUsd >= limits.dailyBudgetUsd) return { ok: false, reason: "daily_budget" };
  if (usage.sessionGenerationsToday >= limits.perSessionMaxGenerations) {
    return { ok: false, reason: "session_limit" };
  }
  return { ok: true };
}
