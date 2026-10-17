import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateBudget } from "@/lib/budget/policy";
import { checkRateLimit, clientIp, hashIp } from "@/lib/budget/rateLimit";
import { LibsqlStore } from "@/lib/server-store/libsqlStore";

const limits = { dailyBudgetUsd: 5, perSessionMaxGenerations: 40 };

describe("evaluateBudget", () => {
  it("allows generation under both caps", () => {
    expect(evaluateBudget({ spentTodayUsd: 4.99, sessionGenerationsToday: 39 }, limits)).toEqual({
      ok: true,
    });
  });

  it("stops at the daily budget (checked first)", () => {
    expect(evaluateBudget({ spentTodayUsd: 5, sessionGenerationsToday: 99 }, limits)).toEqual({
      ok: false,
      reason: "daily_budget",
    });
  });

  it("stops a session at its daily generation cap", () => {
    expect(evaluateBudget({ spentTodayUsd: 0, sessionGenerationsToday: 40 }, limits)).toEqual({
      ok: false,
      reason: "session_limit",
    });
  });

  it("a $0 budget disables live generation entirely", () => {
    expect(
      evaluateBudget(
        { spentTodayUsd: 0, sessionGenerationsToday: 0 },
        { ...limits, dailyBudgetUsd: 0 },
      ).ok,
    ).toBe(false);
  });
});

describe("rate limits", () => {
  let dir: string;
  let store: LibsqlStore;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "multibooks-rl-"));
    store = LibsqlStore.fromUrl(`file:${path.join(dir, "rl.db")}`);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const rl = { perSessionPerMinute: 8, perIpPerMinute: 150 };
  const t0 = Date.UTC(2026, 9, 17, 10, 0, 5);

  it("limits a single session per minute and says when to retry", async () => {
    const ids = { sessionId: "kid-1", ipHash: "school" };
    for (let i = 0; i < 8; i++) expect((await checkRateLimit(store, ids, rl, t0)).ok).toBe(true);
    const ninth = await checkRateLimit(store, ids, rl, t0);
    expect(ninth).toEqual({ ok: false, scope: "session", retryAfterSec: 55 });
    // A new minute starts fresh.
    expect((await checkRateLimit(store, ids, rl, t0 + 60_000)).ok).toBe(true);
  });

  it("lets a classroom of 25 kids behind one IP keep reading", async () => {
    for (let round = 0; round < 5; round++) {
      for (let kid = 0; kid < 25; kid++) {
        const r = await checkRateLimit(
          store,
          { sessionId: `kid-${kid}`, ipHash: "school" },
          rl,
          t0,
        );
        expect(r.ok).toBe(true);
      }
    }
  });

  it("still stops scripted abuse from one IP rotating session ids", async () => {
    let blocked = 0;
    for (let i = 0; i < 160; i++) {
      const r = await checkRateLimit(store, { sessionId: `bot-${i}`, ipHash: "bot" }, rl, t0);
      if (!r.ok) blocked++;
    }
    expect(blocked).toBe(10);
  });
});

describe("IP handling", () => {
  it("reads the first forwarded address and hashes it with a daily salt", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
    const a = hashIp("203.0.113.7", "secret", "2026-10-17");
    expect(a).not.toContain("203");
    expect(a).toHaveLength(32);
    expect(hashIp("203.0.113.7", "secret", "2026-10-18")).not.toBe(a);
  });
});
