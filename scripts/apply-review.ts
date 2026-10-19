/**
 * Applies review decisions from content/review/<id>/detours-review.json:
 * - "approve": written to content/review/<id>/approved.json (commit it). Approved text always
 *   overrides generated text and survives prompt-version bumps.
 * - "reject": removed from the shared cache (DATABASE_URL), so it regenerates on next request
 *   or the next `npm run cache:prewarm`.
 *
 *   npm run cache:apply-review
 *   npm run cache:apply-review -- --book odyssey
 */
import fs from "node:fs/promises";
import path from "node:path";
import { detourCacheKey } from "../lib/engine/cacheKey";
import { applyReview, type ReviewEntry } from "../lib/engine/review";
import { splitSegments } from "../lib/prompts/detour";
import { createStore } from "../lib/server-store/create";
import { booksFromArgs, ROOT, writeJson } from "./lib/paths";

async function main() {
  const store = createStore(
    process.env.DATABASE_URL || "file:./data/local.db",
    process.env.DATABASE_AUTH_TOKEN || undefined,
  );
  let failed = false;
  for (const id of booksFromArgs()) {
    const reviewDir = path.join(ROOT, "content/review", id);
    let entries: ReviewEntry[];
    try {
      entries = JSON.parse(await fs.readFile(path.join(reviewDir, "detours-review.json"), "utf8"));
    } catch {
      console.log(`${id}: no detours-review.json (run npm run cache:export-review first)`);
      continue;
    }
    const { approved, rejected, pending, problems } = applyReview(entries, splitSegments);
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    if (problems.length) failed = true;

    await writeJson(path.join(reviewDir, "approved.json"), approved);
    for (const key of rejected) {
      const [m, cpId, optionId, perspective] = key.split(":");
      await store.deleteDetour(
        detourCacheKey({ bookId: id, mapVersion: Number(m.slice(1)), cpId, optionId, perspective }),
      );
    }
    console.log(
      `${id}: ${Object.keys(approved).length} approved, ${rejected.length} rejected (removed from cache), ${pending} still pending`,
    );
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
