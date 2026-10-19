/**
 * Pre-generates every reachable book detour through the Batch API (half price) and stores them
 * in the shared cache, so a pilot starts with zero live generation for books.
 *
 *   npm run cache:prewarm -- --dry-run          # count what's missing and estimate cost
 *   npm run cache:prewarm                       # all books
 *   npm run cache:prewarm -- --book alice
 *
 * Writes to DATABASE_URL. To pre-warm production, run it locally with DATABASE_URL and
 * DATABASE_AUTH_TOKEN pointing at your Turso database.
 * Skips detours already cached for the current prompt + map version, and hand-approved ones.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { detourCacheKey } from "../lib/engine/cacheKey";
import { enumerateDetours } from "../lib/engine/enumerate";
import { DEFAULT_MODEL } from "../lib/llm/models";
import { estimateCostUsd } from "../lib/llm/pricing";
import { buildDetourPrompt, splitSegments } from "../lib/prompts/detour";
import { PROMPT_VERSION } from "../lib/prompts/version";
import { AdventureMapSchema } from "../lib/schemas/adventure";
import {
  BookMetaSchema,
  ChapterSchema,
  CharactersSchema,
  SummariesSchema,
  type Chapter,
} from "../lib/schemas/content";
import { createStore } from "../lib/server-store/create";
import { isMockMode, runBatch } from "./lib/batch";
import { bookDir, booksFromArgs, readJson, ROOT } from "./lib/paths";

const dryRun = process.argv.includes("--dry-run");

async function loadApproved(bookId: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(ROOT, "content/review", bookId, "approved.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

async function main() {
  const store = createStore(
    process.env.DATABASE_URL || "file:./data/local.db",
    process.env.DATABASE_AUTH_TOKEN || undefined,
  );
  const model = process.env.MODEL_OFFLINE || DEFAULT_MODEL;
  let grandTotal = 0;
  let grandMissing = 0;
  let grandEstimate = 0;

  for (const id of booksFromArgs()) {
    const dir = bookDir(id);
    const book = BookMetaSchema.parse(await readJson(path.join(dir, "meta.json")));
    const map = AdventureMapSchema.parse(await readJson(path.join(dir, "adventure-map.json")));
    const summaries = SummariesSchema.parse(await readJson(path.join(dir, "summaries.json")));
    const cast = CharactersSchema.parse(
      await readJson(path.join(dir, "characters.json")),
    ).characters;
    const approved = await loadApproved(id);

    const chapters = new Map<number, Chapter>();
    for (const cp of map.choicePoints) {
      if (!chapters.has(cp.chapter)) {
        chapters.set(
          cp.chapter,
          ChapterSchema.parse(
            await readJson(
              path.join(dir, "chapters", `${String(cp.chapter).padStart(3, "0")}.json`),
            ),
          ),
        );
      }
    }

    const combos = enumerateDetours(map);
    const missing = [];
    for (const c of combos) {
      const key = detourCacheKey({
        bookId: id,
        mapVersion: map.version,
        cpId: c.cp.id,
        optionId: c.option.id,
        perspective: c.perspective,
      });
      const approvedKey = `m${map.version}:${c.cp.id}:${c.option.id}:${c.perspective}`;
      if (approved[approvedKey] || (await store.getDetour(key))) continue;
      missing.push({ ...c, key });
    }

    const items = missing.map((c) => {
      const prompt = buildDetourPrompt({
        book,
        chapter: chapters.get(c.cp.chapter)!,
        chapterSummary: summaries.chapters.find((s) => s.index === c.cp.chapter)?.summary ?? "",
        previousSummary: summaries.chapters.find((s) => s.index === c.cp.chapter - 1)?.summary,
        cp: c.cp,
        option: c.option,
        character: cast.find((ch) => ch.id === c.perspective),
      });
      return {
        customId: `${c.cp.id}_${c.option.id}_${c.perspective}`.slice(0, 64),
        key: c.key,
        combo: c,
        system: prompt.system,
        user: prompt.user,
        schema: prompt.schema,
        maxTokens: prompt.maxTokens,
        placeholder: prompt.mock,
      };
    });

    // Rough estimate: ~4 characters per token in, ~450 tokens out per detour, batch pricing.
    const estimate = items.reduce(
      (n, i) =>
        n +
        estimateCostUsd(
          model,
          { inputTokens: Math.round((i.system.length + i.user.length) / 4), outputTokens: 450 },
          { batch: true },
        ),
      0,
    );
    grandTotal += combos.length;
    grandMissing += items.length;
    grandEstimate += estimate;
    console.log(
      `${id}: ${combos.length} reachable detours, ${combos.length - items.length} already cached/approved, ${items.length} to generate (~$${estimate.toFixed(3)})`,
    );
    if (dryRun || items.length === 0) continue;
    if (isMockMode()) {
      console.log("  [mock] No API key (or LLM_PROVIDER=mock): nothing written.");
      continue;
    }

    const run = await runBatch(`prewarm-${id}-v${PROMPT_VERSION}-m${map.version}`, items, {
      effort: "low",
    });
    let written = 0;
    for (const item of items) {
      const out = run.results.get(item.customId);
      if (!out) continue;
      await store.putDetour({
        cacheKey: item.key,
        bookId: id,
        cpId: item.combo.cp.id,
        optionId: item.combo.option.id,
        perspective: item.combo.perspective,
        payload: { segments: splitSegments(out.story) },
        source: "prewarm",
        createdAt: Date.now(),
      });
      written++;
    }
    console.log(
      `  wrote ${written}/${items.length} detours to the cache (~$${run.estCostUsd.toFixed(3)})`,
    );
  }
  console.log(
    `\nTotal: ${grandTotal} reachable, ${grandMissing} ${dryRun ? "would be generated" : "attempted"} (~$${grandEstimate.toFixed(3)} estimated)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
