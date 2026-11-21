import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { utcDay, type ServerStore } from "@/lib/server-store/ServerStore";
import { toPositional } from "@/lib/server-store/postgresStore";
import { BACKENDS } from "./storeBackends";

describe.each(BACKENDS)("ServerStore on $name", ({ make }) => {
  let store: ServerStore;
  let cleanup: () => Promise<void>;
  beforeEach(async () => {
    ({ store, cleanup } = await make());
  });
  afterEach(async () => cleanup());

  it("accumulates daily spend from usage logs", async () => {
    const base = {
      kind: "adventure_cont" as const,
      model: "claude-haiku-5-5",
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      latencyMs: 100,
      ok: true,
    };
    await store.logUsage({ ...base, estCostUsd: 0.25 });
    await store.logUsage({ ...base, estCostUsd: 0.5 });
    expect(await store.getDailySpend(utcDay())).toBeCloseTo(0.75);
    const rows = await store.query<{ n: number }>("SELECT COUNT(*) AS n FROM llm_usage");
    expect(Number(rows[0].n)).toBe(2);
  });

  it("counts and expires counter buckets", async () => {
    expect(await store.incrementCounter("ip:1", 60_000)).toBe(1);
    expect(await store.incrementCounter("ip:1", 60_000)).toBe(2);
    expect(await store.getCounter("ip:1")).toBe(2);
    expect(await store.incrementCounter("old", -1)).toBe(1);
    expect(await store.getCounter("old")).toBe(0);
    expect(await store.incrementCounter("old", 60_000)).toBe(1); // reset after expiry
  });

  it("logs analytics events", async () => {
    await store.logEvents([
      {
        sessionId: "s1",
        sessionCode: "LIB-1",
        type: "book_selected",
        props: { bookId: "alice" },
        ts: 1,
      },
      { sessionId: "s1", type: "mode_chosen", props: { mode: "adventure" }, ts: 2 },
    ]);
    const rows = await store.query<{ type: string }>("SELECT type FROM events ORDER BY ts");
    expect(rows.map((r) => r.type)).toEqual(["book_selected", "mode_chosen"]);
  });
});

describe("toPositional", () => {
  it("numbers placeholders for Postgres", () => {
    expect(toPositional("a = ? AND b IN (?, ?)")).toBe("a = $1 AND b IN ($2, $3)");
  });
});
