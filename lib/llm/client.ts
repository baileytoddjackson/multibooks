import "server-only";
import { env } from "@/lib/env";
import { AnthropicProvider } from "./anthropicProvider";
import { MockProvider } from "./mockProvider";
import type { LLMProvider } from "./types";

let provider: LLMProvider | undefined;

/** Runtime provider: Anthropic when configured with a key, otherwise the free mock. */
export function llm(): LLMProvider {
  if (!provider) {
    const e = env();
    provider =
      e.LLM_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY
        ? new AnthropicProvider(e.MODEL_RUNTIME)
        : new MockProvider();
  }
  return provider;
}
