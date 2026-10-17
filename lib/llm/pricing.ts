/**
 * Estimated USD pricing per million tokens. Used for the daily budget cap and the admin
 * cost view, so it only needs to be close — but keep it in sync with
 * https://docs.claude.com/en/docs/about-claude/pricing when models change.
 */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Optional higher tier applied when a single prompt exceeds `overTokens` input tokens. */
  longContext?: { overTokens: number; inputPerMTok: number; outputPerMTok: number };
}

const PRICES: Record<string, ModelPrice> = {
  // Default for MultiBooks. Prompts over 100K tokens are billed at the higher tier.
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    longContext: { overTokens: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
  },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
};

/** Unknown models are priced like Opus so the budget cap errs on the safe side. */
const FALLBACK_PRICE: ModelPrice = PRICES["claude-opus-5"];

const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute TTL
const CACHE_READ_MULTIPLIER = 0.1;
const BATCH_MULTIPLIER = 0.5;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Responses may report dated ids ("claude-haiku-4-5-20251001"); price them as the alias. */
function normalizeModel(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

export function priceFor(model: string): ModelPrice {
  return PRICES[normalizeModel(model)] ?? FALLBACK_PRICE;
}

/**
 * Cost of one request (or a sum of requests). The long-context tier is decided per request, so
 * pass per-request usage when it matters; summed usage from many small prompts stays on the base tier
 * unless `opts.perRequestInput` says otherwise.
 */
export function estimateCostUsd(
  model: string,
  usage: TokenUsage,
  opts: { batch?: boolean; perRequestInput?: number } = {},
): number {
  const p = priceFor(model);
  const promptTokens =
    opts.perRequestInput ??
    usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const tier = p.longContext && promptTokens > p.longContext.overTokens ? p.longContext : p;
  const perIn = tier.inputPerMTok / 1_000_000;
  const perOut = tier.outputPerMTok / 1_000_000;
  const cost =
    usage.inputTokens * perIn +
    (usage.cacheWriteTokens ?? 0) * perIn * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens ?? 0) * perIn * CACHE_READ_MULTIPLIER +
    usage.outputTokens * perOut;
  return opts.batch ? cost * BATCH_MULTIPLIER : cost;
}
