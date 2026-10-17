import "server-only";
import { llm } from "@/lib/llm/client";
import { estimateCostUsd } from "@/lib/llm/pricing";
import { InvalidOutputError } from "@/lib/llm/types";
import { buildModerationPrompt } from "@/lib/prompts/moderation";
import { serverStore } from "@/lib/server-store";
import { findBlocked } from "./blocklist";
import { findPii } from "./piiPatterns";

export type ModerationReason =
  "too_long" | "personal_info" | "blocked" | "model_flagged" | "unavailable";

export type ModerationResult = { ok: true } | { ok: false; reason: ModerationReason };

/**
 * Checks the stepper's free text: length → personal info → blocklist (all free) → a cheap model
 * check. Fails closed when the model check can't run, because the generation that follows
 * wouldn't work either and the UI offers a friendly retry.
 */
export async function moderateStoryIdea(
  fields: { setting: string; details?: string },
  ctx: { sessionId: string; maxLengths: { setting: number; details: number } },
): Promise<ModerationResult> {
  const setting = fields.setting.trim();
  const details = fields.details?.trim();
  if (setting.length > ctx.maxLengths.setting || (details?.length ?? 0) > ctx.maxLengths.details) {
    return { ok: false, reason: "too_long" };
  }
  const all = [setting, details].filter(Boolean).join("\n");
  if (findPii(all)) return { ok: false, reason: "personal_info" };
  if (findBlocked(all)) return { ok: false, reason: "blocked" };

  const store = serverStore();
  const prompt = buildModerationPrompt({ setting, details });
  try {
    const r = await llm().generate(prompt);
    await store.logUsage({
      sessionId: ctx.sessionId,
      kind: "moderation",
      model: r.model,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      cacheReadTokens: r.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: r.usage.cacheWriteTokens ?? 0,
      estCostUsd: estimateCostUsd(r.model, r.usage),
      latencyMs: r.latencyMs,
      ok: true,
    });
    if (!r.data.ok) {
      const personal = r.data.reason === "personal_info" || r.data.reason === "real_person";
      return { ok: false, reason: personal ? "personal_info" : "model_flagged" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof InvalidOutputError && err.billed) {
      await store.logUsage({
        sessionId: ctx.sessionId,
        kind: "moderation",
        model: err.billed.model,
        inputTokens: err.billed.usage.inputTokens,
        outputTokens: err.billed.usage.outputTokens,
        cacheReadTokens: err.billed.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: err.billed.usage.cacheWriteTokens ?? 0,
        estCostUsd: estimateCostUsd(err.billed.model, err.billed.usage),
        latencyMs: err.billed.latencyMs,
        ok: false,
      });
    }
    console.error("moderation failed", err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Free scan of generated Create Your Own text (the model check is reserved for kid input).
 * Blocklist only: PII patterns would mostly flag the model's own made-up names and places.
 */
export function generatedTextIsClean(...texts: string[]): boolean {
  return !texts.some((t) => findBlocked(t));
}
