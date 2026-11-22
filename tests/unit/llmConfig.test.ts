import { describe, expect, it } from "vitest";
import { llmConfigProblem } from "@/lib/llm/client";
import type { Env } from "@/lib/env";

const base = { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-api03-x" } as Env;

describe("llmConfigProblem", () => {
  it("never allows practice (mock) text on Vercel", () => {
    expect(llmConfigProblem(base, true)).toBeUndefined();
    expect(llmConfigProblem({ ...base, LLM_PROVIDER: "mock" }, true)).toMatch(/LLM_PROVIDER/);
    expect(llmConfigProblem({ ...base, ANTHROPIC_API_KEY: undefined }, true)).toMatch(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("allows the free mock locally and in tests", () => {
    expect(llmConfigProblem({ ...base, LLM_PROVIDER: "mock" }, false)).toBeUndefined();
  });
});
