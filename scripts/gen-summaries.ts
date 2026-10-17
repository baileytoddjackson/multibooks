/**
 * Chapter summaries + book synopsis via the Batch API → content/books/<id>/summaries.json.
 * One request per chapter (so even Moby-Dick never exceeds the model's context), then one
 * synopsis request built only from the chapter summaries.
 *
 *   npm run content:summaries                 # all books
 *   npm run content:summaries -- --book alice
 *   npm run content:summaries -- --force       # redo chapters that already have summaries
 *
 * Without ANTHROPIC_API_KEY this writes clearly marked placeholders (generatedBy: "placeholder").
 */
import path from "node:path";
import { summaryUser, SUMMARY_SYSTEM, SYNOPSIS_SYSTEM, synopsisUser } from "../lib/prompts/offline";
import {
  BookMetaSchema,
  BookSynopsisOutputSchema,
  ChapterSchema,
  ChapterSummaryOutputSchema,
  SummariesSchema,
  TocSchema,
  type Chapter,
  type ChapterSummaryOutput,
} from "../lib/schemas/content";
import { runBatch } from "./lib/batch";
import { bookDir, booksFromArgs, readJson, writeJson, type ScriptBookId } from "./lib/paths";

function placeholderSummary(ch: Chapter): ChapterSummaryOutput {
  const firstWords = ch.paragraphs
    .filter((p) => !p.kind)
    .map((p) => p.text)
    .join(" ")
    .replace(/_/g, "")
    .split(/\s+/)
    .slice(0, 60)
    .join(" ");
  return {
    summary: `[Placeholder] ${firstWords}…`,
    keyEvents: [ch.subtitle ?? ch.title],
    charactersPresent: [],
    setting: "",
    kind: "narrative",
    contentNotes: [],
  };
}

async function processBook(id: ScriptBookId) {
  const meta = BookMetaSchema.parse(await readJson(path.join(bookDir(id), "meta.json")));
  const toc = TocSchema.parse(await readJson(path.join(bookDir(id), "toc.json")));
  const chapters = await Promise.all(
    toc.chapters.map(async (c) =>
      ChapterSchema.parse(
        await readJson(
          path.join(bookDir(id), "chapters", `${String(c.index).padStart(3, "0")}.json`),
        ),
      ),
    ),
  );

  // Re-runs only redo chapters that are missing or placeholders, unless --force is passed.
  const force = process.argv.includes("--force");
  const existing = force
    ? undefined
    : await readJson(path.join(bookDir(id), "summaries.json"))
        .then((j) => SummariesSchema.parse(j))
        .catch(() => undefined);
  const keep = new Map(
    (existing?.chapters ?? [])
      .filter((s) => s.generatedBy !== "placeholder")
      .map((s) => [s.index, s]),
  );
  const todo = chapters.filter((ch) => !keep.has(ch.index));

  console.log(
    `${id}: summarizing ${todo.length} of ${chapters.length} chapters` +
      (keep.size ? ` (keeping ${keep.size} existing; --force to redo all)` : ""),
  );
  const chapterRun = await runBatch(
    `summaries-${id}`,
    todo.map((ch) => ({
      customId: `${id}-c${ch.index}`,
      system: SUMMARY_SYSTEM,
      user: summaryUser(meta.title, ch),
      schema: ChapterSummaryOutputSchema,
      maxTokens: 2000,
      placeholder: () => placeholderSummary(ch),
    })),
  );

  const summaries = chapters.map((ch) => {
    const kept = keep.get(ch.index);
    if (kept) return kept;
    const s = chapterRun.results.get(`${id}-c${ch.index}`) ?? placeholderSummary(ch);
    const generatedBy = chapterRun.results.has(`${id}-c${ch.index}`)
      ? chapterRun.generatedBy
      : "placeholder";
    return { index: ch.index, ...s, keyEvents: s.keyEvents.slice(0, 5), generatedBy };
  });

  if (existing && todo.length === 0 && !existing.synopsis.startsWith("[Placeholder]")) {
    console.log(`${id}: nothing to do`);
    return;
  }

  console.log(`${id}: writing synopsis`);
  const synopsisRun = await runBatch(`synopsis-${id}`, [
    {
      customId: `${id}-synopsis`,
      system: SYNOPSIS_SYSTEM,
      user: synopsisUser(meta.title, summaries),
      schema: BookSynopsisOutputSchema,
      maxTokens: 2000,
      placeholder: () => ({
        synopsis: `[Placeholder] ${meta.hook}`,
        majorArcs: ["(placeholder)", "(placeholder)"],
      }),
    },
  ]);
  const synopsisOut = synopsisRun.results.get(`${id}-synopsis`)!;
  const synopsis = { ...synopsisOut, majorArcs: synopsisOut.majorArcs.slice(0, 6) };

  const out = SummariesSchema.parse({ bookId: id, chapters: summaries, ...synopsis });
  await writeJson(path.join(bookDir(id), "summaries.json"), out);
  const placeholders = summaries.filter((s) => s.generatedBy === "placeholder").length;
  console.log(`${id}: done (${placeholders} placeholder chapters)`);
}

async function main() {
  for (const id of booksFromArgs()) await processBook(id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
