/**
 * Offline Batch API runner for content scripts (50% cheaper than live calls).
 *
 * - Resumable: the batch id is saved under data/batches/<label>.json, so re-running after a
 *   crash or Ctrl-C picks up the same batch instead of paying twice.
 * - Every result is validated with Zod; failures are retried once as a normal (non-batch) call.
 * - Valid results are cached in data/batches/<label>.results.json, keyed by a hash of the request,
 *   so re-running after a code fix only pays for requests that changed or previously failed.
 * - Without ANTHROPIC_API_KEY (or with LLM_PROVIDER=mock) it calls `placeholder()` instead, so the
 *   pipeline can be exercised for free. Placeholder output is marked and never mistaken for real.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { DEFAULT_MODEL, effortConfig, type Effort } from "../../lib/llm/models";
import { estimateCostUsd, type TokenUsage } from "../../lib/llm/pricing";
import { outputFormat, parseStructured } from "../../lib/llm/structured";
import { ROOT } from "./paths";

export interface BatchItem<T> {
  customId: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  /** Used when running without an API key. */
  placeholder: () => T;
}

export interface BatchOutcome<T> {
  results: Map<string, T>;
  generatedBy: string;
  usage: TokenUsage;
  estCostUsd: number;
}

const DATA_DIR = path.join(ROOT, "data");

export function offlineModel() {
  return process.env.MODEL_OFFLINE || DEFAULT_MODEL;
}

export function isMockMode() {
  return process.env.LLM_PROVIDER === "mock" || !process.env.ANTHROPIC_API_KEY;
}

/**
 * Offline work defaults to `medium` effort: accuracy matters more than for live story segments,
 * and the extra cost is negligible at these volumes.
 */
export async function runBatch<T>(
  label: string,
  items: BatchItem<T>[],
  opts: { effort?: Effort } = {},
): Promise<BatchOutcome<T>> {
  if (items.length === 0) {
    return { results: new Map(), generatedBy: "none", usage: zeroUsage(), estCostUsd: 0 };
  }
  if (isMockMode()) {
    console.log(`  [mock] No ANTHROPIC_API_KEY (or LLM_PROVIDER=mock): writing placeholders.`);
    return {
      results: new Map(items.map((i) => [i.customId, i.placeholder()])),
      generatedBy: "placeholder",
      usage: zeroUsage(),
      estCostUsd: 0,
    };
  }

  const client = new Anthropic();
  const model = offlineModel();
  const results = new Map<string, T>();

  // Reuse cached results for identical requests.
  const cacheFile = path.join(DATA_DIR, "batches", `${label}.results.json`);
  const cache = await fs
    .readFile(cacheFile, "utf8")
    .then((s) => JSON.parse(s) as Record<string, { hash: string; data: unknown }>)
    .catch(() => ({}) as Record<string, { hash: string; data: unknown }>);
  const hashOf = (i: BatchItem<T>) =>
    createHash("sha256")
      .update(
        JSON.stringify([
          model,
          opts.effort ?? "medium",
          i.maxTokens,
          i.system,
          i.user,
          outputFormat(i.schema),
        ]),
      )
      .digest("hex");
  const pending: BatchItem<T>[] = [];
  for (const i of items) {
    const hit = cache[i.customId];
    const parsed = hit?.hash === hashOf(i) ? i.schema.safeParse(hit.data) : undefined;
    if (parsed?.success) results.set(i.customId, parsed.data);
    else pending.push(i);
  }
  if (results.size) console.log(`  Reusing ${results.size} cached result(s)`);
  const saveCache = async () => {
    for (const i of items) {
      if (results.has(i.customId))
        cache[i.customId] = { hash: hashOf(i), data: results.get(i.customId) };
    }
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(cache));
  };
  if (pending.length === 0) {
    return { results, generatedBy: model, usage: zeroUsage(), estCostUsd: 0 };
  }

  const byId = new Map(pending.map((i) => [i.customId, i]));
  // Thinking tokens count toward max_tokens, so retries get double the room and lower effort.
  const params = (i: BatchItem<T>, attempt: "first" | "retry" = "first") => ({
    model,
    max_tokens: attempt === "retry" ? i.maxTokens * 2 : i.maxTokens,
    system: [
      { type: "text" as const, text: i.system, cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: i.user }],
    output_config: {
      format: outputFormat(i.schema),
      ...effortConfig(model, attempt === "retry" ? "low" : (opts.effort ?? "medium")),
    },
  });

  const stateFile = path.join(DATA_DIR, "batches", `${label}.json`);
  let batchId = await fs
    .readFile(stateFile, "utf8")
    .then((s) => (JSON.parse(s) as { batchId: string }).batchId)
    .catch(() => undefined);

  if (batchId) {
    console.log(`  Resuming batch ${batchId}`);
  } else {
    const batch = await client.messages.batches.create({
      requests: pending.map((i) => ({ custom_id: i.customId, params: params(i) })),
    });
    batchId = batch.id;
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify({ batchId, createdAt: new Date().toISOString() }));
    console.log(`  Created batch ${batchId} (${pending.length} requests, model ${model})`);
  }

  for (;;) {
    const b = await client.messages.batches.retrieve(batchId);
    if (b.processing_status === "ended") break;
    const c = b.request_counts;
    console.log(`  …processing (${c.succeeded} done, ${c.processing} in progress)`);
    await new Promise((r) => setTimeout(r, 30_000));
  }

  const usage = zeroUsage();
  const retry: BatchItem<T>[] = [];
  // Priced per request: long-context tiers depend on each prompt's size, not the batch total.
  let cost = 0;

  for await (const r of await client.messages.batches.results(batchId)) {
    const item = byId.get(r.custom_id);
    if (!item) continue;
    if (r.result.type !== "succeeded") {
      retry.push(item);
      continue;
    }
    const msg = r.result.message;
    addUsage(usage, msg.usage);
    cost += estimateCostUsd(model, usageOf(msg.usage), { batch: true });
    if (msg.stop_reason === "max_tokens") {
      retry.push(item);
      continue;
    }
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    try {
      results.set(r.custom_id, parseStructured(item.schema, text));
    } catch {
      retry.push(item);
    }
  }

  // One synchronous retry for anything that failed or didn't validate.
  for (const item of retry) {
    console.log(`  Retrying ${item.customId} as a live call (more room, low effort)`);
    try {
      const msg = await client.messages.create(params(item, "retry"));
      addUsage(usage, msg.usage);
      cost += estimateCostUsd(model, usageOf(msg.usage));
      if (msg.stop_reason === "max_tokens") throw new Error("ran out of output tokens again");
      const text = msg.content.find((b) => b.type === "text")?.text ?? "";
      results.set(item.customId, parseStructured(item.schema, text));
    } catch (err) {
      console.warn(`  ✗ ${item.customId} failed again; skipping. ${(err as Error).message}`);
    }
  }

  await saveCache();
  await fs.rm(stateFile, { force: true });
  await logOfflineUsage(label, model, usage, cost, pending.length);
  return { results, generatedBy: model, usage, estCostUsd: cost };
}

function zeroUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function usageOf(u: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

function addUsage(total: TokenUsage, u: Anthropic.Usage) {
  total.inputTokens += u.input_tokens;
  total.outputTokens += u.output_tokens;
  total.cacheReadTokens = (total.cacheReadTokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  total.cacheWriteTokens = (total.cacheWriteTokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

/** Appends to data/offline-usage.jsonl; /admin/stats includes it in the offline cost line. */
async function logOfflineUsage(
  label: string,
  model: string,
  usage: TokenUsage,
  estCostUsd: number,
  requests: number,
) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const line = { ts: new Date().toISOString(), label, model, requests, ...usage, estCostUsd };
  await fs.appendFile(path.join(DATA_DIR, "offline-usage.jsonl"), JSON.stringify(line) + "\n");
  console.log(
    `  Usage: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out → ~$${estCostUsd.toFixed(3)}`,
  );
}
