import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStats, listGroupCodes } from "@/lib/admin/stats";
import { utcDay, type ServerStore } from "@/lib/server-store/ServerStore";
import { BACKENDS } from "./storeBackends";

const NOW = Date.now();
const ev = (
  sessionId: string,
  type: string,
  props: Record<string, unknown>,
  sessionCode?: string,
) => ({
  sessionId,
  sessionCode,
  type,
  props,
  ts: NOW - 1000,
});

async function seed(store: ServerStore) {
  await store.logEvents([
    ev("s1", "book_selected", { bookId: "alice" }, "MS-ENG-P3"),
    ev("s1", "mode_chosen", { bookId: "alice", mode: "adventure" }, "MS-ENG-P3"),
    ev(
      "s1",
      "style_chosen",
      { context: "book", style: "character", characterId: "alice" },
      "MS-ENG-P3",
    ),
    ev("s1", "choice_made", { context: "book", bookId: "alice", cpId: "cp01" }, "MS-ENG-P3"),
    ev(
      "s1",
      "adventure_started",
      { bookId: "alice", optionId: "p1", style: "character" },
      "MS-ENG-P3",
    ),
    ev("s1", "choice_made", { context: "adventure", bookId: "alice", turn: 2 }, "MS-ENG-P3"),
    ev("s1", "choice_made", { context: "adventure", bookId: "alice", turn: 3 }, "MS-ENG-P3"),
    ev("s1", "adventure_finished", { bookId: "alice", turns: 4 }, "MS-ENG-P3"),
    ev("s1", "words_read", { context: "book", words: 600 }, "MS-ENG-P3"),
    ev("s1", "session_heartbeat", { path: "read" }, "MS-ENG-P3"),
    ev("s1", "session_heartbeat", { path: "read" }, "MS-ENG-P3"),
    ev("s2", "book_selected", { bookId: "moby-dick" }, "LIB-OCT20"),
    ev("s2", "create_started", {}, "LIB-OCT20"),
    ev("s2", "stepper_step_viewed", { step: 1 }, "LIB-OCT20"),
    ev("s2", "stepper_step_completed", { step: 1, genre: "mystery" }, "LIB-OCT20"),
    ev("s2", "stepper_step_viewed", { step: 2 }, "LIB-OCT20"),
    ev("s2", "stepper_step_completed", { step: 2, usedSurprise: true }, "LIB-OCT20"),
    ev("s2", "stepper_step_viewed", { step: 3 }, "LIB-OCT20"),
    ev("s2", "create_completed", { genre: "mystery" }, "LIB-OCT20"),
    ev("s2", "choice_made", { context: "cyo", turn: 2 }, "LIB-OCT20"),
    ev("s2", "words_read", { context: "cyo", words: 250 }, "LIB-OCT20"),
  ]);
  const usage = {
    model: "claude-haiku-5-5",
    inputTokens: 1000,
    outputTokens: 400,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    latencyMs: 2000,
    ok: true,
  };
  await store.logUsage({
    ...usage,
    sessionId: "s1",
    kind: "adventure_cont",
    bookId: "alice",
    estCostUsd: 0.0005,
  });
  await store.logUsage({ ...usage, sessionId: "s2", kind: "cyo_open", estCostUsd: 0.0007 });
}

describe.each(BACKENDS)("admin stats on $name", ({ make }) => {
  let store: ServerStore;
  let cleanup: () => Promise<void>;
  beforeEach(async () => {
    ({ store, cleanup } = await make());
    await seed(store);
  });
  afterEach(async () => cleanup());

  it("computes the same numbers on every backend", async () => {
    const s = await getStats(store, { fromMs: 0, toMs: Date.now() + 1000 }, utcDay());
    expect(s.sessions).toBe(2);
    expect(s.totalWords).toBe(850);
    expect(s.avgActiveMinutes).toBeCloseTo(0.5); // 2 heartbeats × 30s over 2 sessions
    expect(s.choices).toEqual({ book: 1, adventure: 2, cyo: 1 });
    expect(s.adventures).toEqual({ started: 1, finished: 1 });
    expect(s.adventuresByBook).toEqual([{ label: "alice", value: 1 }]);
    expect(s.books.map((b) => [b.label, b.value]).sort()).toEqual([
      ["alice", 1],
      ["moby-dick", 1],
    ]);
    expect(s.modes).toEqual([{ label: "adventure", value: 1 }]);
    expect(s.styles).toEqual([{ label: "character", value: 1 }]);
    expect(s.funnel.map((f) => f.value)).toEqual([1, 1, 1, 1, 0]);
    expect(s.genres).toEqual([{ label: "mystery", value: 1 }]);
    expect(s.surpriseUseRate).toBe(1);
    expect(s.totalCost).toBeCloseTo(0.0012, 6);
    expect(s.todaySpend).toBeCloseTo(0.0012, 6);
    expect(s.usageByKind.map((k) => k.kind).sort()).toEqual(["adventure_cont", "cyo_open"]);
    expect(s.codes.map((c) => [c.code, c.sessions, c.words]).sort()).toEqual([
      ["LIB-OCT20", 1, 250],
      ["MS-ENG-P3", 1, 600],
    ]);
  });

  it("filters by group code, including usage", async () => {
    const s = await getStats(
      store,
      { fromMs: 0, toMs: Date.now() + 1000, sessionCode: "LIB-OCT20" },
      utcDay(),
    );
    expect(s.sessions).toBe(1);
    expect(s.totalWords).toBe(250);
    expect(s.totalCost).toBeCloseTo(0.0007, 6);
    expect(await listGroupCodes(store)).toEqual(["LIB-OCT20", "MS-ENG-P3"]);
  });
});
