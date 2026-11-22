import "server-only";
import { env } from "@/lib/env";
import { AnthropicProvider } from "./anthropicProvider";
import { MockProvider } from "./mockProvider";
import type { LLMProvider, StructuredResult } from "./types";

/**
 * Why live generation can't run on this deployment, or undefined if it can. On Vercel the mock
 * provider is never used: its practice text must not reach real readers. Locally and in tests,
 * LLM_PROVIDER=mock (or no key) uses the free mock on purpose.
 */
export function llmConfigProblem(e = env(), onVercel = !!process.env.VERCEL): string | undefined {
  if (!onVercel) return undefined;
  if (e.LLM_PROVIDER !== "anthropic") return 'LLM_PROVIDER is not "anthropic"';
  if (!e.ANTHROPIC_API_KEY) return "ANTHROPIC_API_KEY is not set";
  return undefined;
}

/** Fails every call with a clear reason, so readers see the friendly retry message instead. */
class UnconfiguredProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  constructor(private readonly problem: string) {}
  private fail(): never {
    throw new Error(`[llm] live generation is not configured: ${this.problem}`);
  }
  async generate<T>(): Promise<StructuredResult<T>> {
    return this.fail();
  }
  async stream<T>(): Promise<StructuredResult<T>> {
    return this.fail();
  }
}

let provider: LLMProvider | undefined;

/** Runtime provider: Anthropic when configured; the free mock only off Vercel. */
export function llm(): LLMProvider {
  if (!provider) {
    const e = env();
    const problem = llmConfigProblem(e);
    if (problem) {
      console.error(`[llm] live generation is not configured: ${problem}`);
      provider = new UnconfiguredProvider(problem);
    } else {
      provider =
        e.LLM_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY
          ? new AnthropicProvider(e.MODEL_RUNTIME)
          : new MockProvider();
    }
  }
  return provider;
}
