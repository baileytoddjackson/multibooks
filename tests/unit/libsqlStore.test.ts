import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibsqlStore } from "@/lib/server-store/libsqlStore";
import { utcDay } from "@/lib/server-store/ServerStore";

let dir: string;
let store: LibsqlStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "multibooks-store-"));
  store = LibsqlStore.fromUrl(`file:${path.join(dir, "test.db")}`);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const detour = {
  cacheKey: "k1",
  bookId: "alice",
  cpId: "cp01",
  optionId: "p1",
  perspective: "narrator",
  payload: { segments: ["Once upon a time."] },
  source: "generated" as const,
  createdAt: 1,
};

describe("LibsqlStore", () => {
  it("stores and returns detours, updating on conflict", async () => {
    expect(await store.getDetour("k1")).toBeUndefined();
    await store.putDetour(detour);
    expect((await store.getDetour("k1"))?.payload.segments).toEqual(["Once upon a time."]);
    await store.putDetour({ ...detour, payload: { segments: ["Edited."] }, source: "approved" });
    const got = await store.getDetour("k1");
    expect(got?.payload.segments).toEqual(["Edited."]);
    expect(got?.source).toBe("approved");
    expect(await store.listDetours("alice")).toHaveLength(1);
  });

  it("lets exactly one of many concurrent callers take a generation lock", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => store.acquireLock("k", 30_000)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    await store.releaseLock("k");
    expect(await store.acquireLock("k", 30_000)).toBe(true);
  });

  it("takes over an expired lock", async () => {
    expect(await store.acquireLock("k", -1)).toBe(true); // already expired
    expect(await store.acquireLock("k", 30_000)).toBe(true);
    expect(await store.acquireLock("k", 30_000)).toBe(false);
  });

  it("accumulates daily spend from usage logs", async () => {
    const base = {
      kind: "detour" as const,
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
