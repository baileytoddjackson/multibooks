import { describe, expect, it } from "vitest";
import { effortConfig, supportsEffort } from "@/lib/llm/models";
import { estimateCostUsd } from "@/lib/llm/pricing";

describe("estimateCostUsd", () => {
  it("prices a typical Haiku 5.5 detour at about five hundredths of a cent", () => {
    const cost = estimateCostUsd("claude-haiku-5-5", { inputTokens: 1400, outputTokens: 650 });
    expect(cost).toBeCloseTo(0.000465, 7);
  });

  it("applies the long-context tier only when a single prompt exceeds 100K tokens", () => {
    const usage = { inputTokens: 150_000, outputTokens: 1000 };
    expect(estimateCostUsd("claude-haiku-5-5", usage)).toBeCloseTo(0.075 + 0.0025, 6);
    // Summed usage from many small prompts stays on the base tier when told so.
    expect(estimateCostUsd("claude-haiku-5-5", usage, { perRequestInput: 1500 })).toBeCloseTo(
      0.015 + 0.0005,
      6,
    );
  });

  it("applies cache read/write multipliers", () => {
    const cost = estimateCostUsd("claude-haiku-4-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.1 + 1.25, 6);
  });

  it("halves cost for batch requests", () => {
    const usage = { inputTokens: 10_000, outputTokens: 2_000 };
    expect(estimateCostUsd("claude-haiku-5-5", usage, { batch: true })).toBeCloseTo(
      estimateCostUsd("claude-haiku-5-5", usage) / 2,
      10,
    );
  });

  it("prices dated model ids like their alias", () => {
    const usage = { inputTokens: 1000, outputTokens: 1000 };
    expect(estimateCostUsd("claude-haiku-4-5-20251001", usage)).toBe(
      estimateCostUsd("claude-haiku-4-5", usage),
    );
  });

  it("prices unknown models conservatively", () => {
    const usage = { inputTokens: 1000, outputTokens: 1000 };
    expect(estimateCostUsd("some-future-model", usage)).toBeGreaterThan(
      estimateCostUsd("claude-haiku-5-5", usage),
    );
  });
});

describe("model options", () => {
  it("sends effort only to models that accept it", () => {
    expect(effortConfig("claude-haiku-5-5")).toEqual({ effort: "low" });
    expect(effortConfig("claude-haiku-4-5")).toEqual({});
    expect(supportsEffort("claude-haiku-4-5-20251001")).toBe(false);
  });
});
