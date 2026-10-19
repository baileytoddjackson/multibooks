/**
 * Exports every reachable detour for human review before a pilot.
 *
 *   npm run cache:export-review                 # all books
 *   npm run cache:export-review -- --book alice
 *
 * Writes, per book:
 *   content/review/<id>/detours-review.md    easy to read (and print)
 *   content/review/<id>/detours-review.json  edit "decision" ("approve" | "reject") and "text" here
 * Then run `npm run cache:apply-review` to turn approvals into approved.json overrides.
 * Re-exporting keeps earlier decisions and notes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { buildReviewEntries, reviewKey, type ReviewEntry } from "../lib/engine/review";
import { detourCacheKey } from "../lib/engine/cacheKey";
import { AdventureMapSchema } from "../lib/schemas/adventure";
import { BookMetaSchema, CharactersSchema, ChapterSchema } from "../lib/schemas/content";
import { createStore } from "../lib/server-store/create";
import { bookDir, booksFromArgs, readJson, ROOT, writeJson } from "./lib/paths";

async function readOr<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function lastWords(text: string, n: number) {
  const w = text.replace(/_/g, "").split(/\s+/);
  return (w.length > n ? "… " : "") + w.slice(-n).join(" ");
}

async function main() {
  const store = createStore(
    process.env.DATABASE_URL || "file:./data/local.db",
    process.env.DATABASE_AUTH_TOKEN || undefined,
  );

  for (const id of booksFromArgs()) {
    const dir = bookDir(id);
    const reviewDir = path.join(ROOT, "content/review", id);
    const book = BookMetaSchema.parse(await readJson(path.join(dir, "meta.json")));
    const map = AdventureMapSchema.parse(await readJson(path.join(dir, "adventure-map.json")));
    const cast = CharactersSchema.parse(
      await readJson(path.join(dir, "characters.json")),
    ).characters;
    const approved = await readOr<Record<string, { segments: string[] }>>(
      path.join(reviewDir, "approved.json"),
      {},
    );
    const previous = await readOr<ReviewEntry[]>(path.join(reviewDir, "detours-review.json"), []);

    // Current cache entries, keyed the same way as approved.json.
    const cached = new Map<string, { segments: string[]; source: string }>();
    for (const d of await store.listDetours(id)) {
      const expected = detourCacheKey({
        bookId: id,
        mapVersion: map.version,
        cpId: d.cpId,
        optionId: d.optionId,
        perspective: d.perspective,
      });
      if (d.cacheKey !== expected) continue; // older prompt/map version
      cached.set(reviewKey(map.version, d.cpId, d.optionId, d.perspective), {
        segments: d.payload.segments,
        source: d.source,
      });
    }

    const entries = buildReviewEntries(map, cached, approved, previous);
    await writeJson(path.join(reviewDir, "detours-review.json"), entries);

    const who = (p: string) =>
      p === "narrator" ? "the narrator" : (cast.find((c) => c.id === p)?.name ?? p);
    const counts = {
      total: entries.length,
      missing: entries.filter((e) => e.source === "missing").length,
      approved: entries.filter((e) => e.decision === "approve").length,
      rejected: entries.filter((e) => e.decision === "reject").length,
      flagged: entries.filter((e) => e.flags.length).length,
    };

    const md: string[] = [
      `# Detour review: ${book.title}`,
      "",
      `Map version ${map.version} · ${counts.total} detours · ${counts.approved} approved · ${counts.rejected} rejected · ${counts.flagged} flagged · ${counts.missing} not generated yet`,
      "",
      "**How to review.** Read each detour below. In `detours-review.json` (same folder), set",
      '`"decision"` to `"approve"` or `"reject"` for each entry, and edit `"text"` if you want to change',
      "the wording (blank lines separate paragraphs). Then run `npm run cache:apply-review`.",
      "Approved text always overrides generated text. Rejected detours are removed from the cache",
      "and will be regenerated; to fix one yourself, edit its text and approve it instead.",
      "",
      "Entries marked ⚠ have something worth a closer look, such as a brief that says who lives or",
      "dies, which must match the original book.",
      "",
    ];

    let lastCp = "";
    for (const e of entries) {
      if (e.cpId !== lastCp) {
        lastCp = e.cpId;
        const cp = map.choicePoints.find((c) => c.id === e.cpId)!;
        const chapter = ChapterSchema.parse(
          await readJson(path.join(dir, "chapters", `${String(cp.chapter).padStart(3, "0")}.json`)),
        );
        const anchor = chapter.paragraphs.find((p) => p.id === cp.anchorAfter)?.text ?? "";
        md.push(`---`, "", `## ${cp.id} · Chapter ${cp.chapter}: “${cp.prompt}”`, "");
        md.push(`> Original text just before the choice: ${lastWords(anchor, 60)}`, "");
      }
      const status = { pending: "☐ pending", approve: "✅ approved", reject: "❌ rejected" }[
        e.decision
      ];
      md.push(`### ${e.flags.length ? "⚠ " : ""}${e.optionLabel}`);
      md.push(`*Told by ${who(e.perspective)} · ${status} · key \`${e.key}\`*`, "");
      md.push(`*Brief:* ${e.brief}`, "");
      for (const f of e.flags) md.push(`- ⚠ ${f}`);
      if (e.flags.length) md.push("");
      md.push(
        e.text
          ? e.text.split(/\n\s*\n/).join("\n\n")
          : "_(not generated yet: run `npm run cache:prewarm`)_",
        "",
      );
    }
    await fs.mkdir(reviewDir, { recursive: true });
    await fs.writeFile(path.join(reviewDir, "detours-review.md"), md.join("\n"));
    console.log(
      `${id}: ${counts.total} detours exported (${counts.flagged} flagged, ${counts.missing} not generated) → content/review/${id}/`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
