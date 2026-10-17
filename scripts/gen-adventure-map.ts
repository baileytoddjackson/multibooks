/**
 * Builds content/books/<id>/adventure-map.json: one choice point per selected chapter.
 *
 * 1. Picks chapters in code: always chapter 1 (the intro choice), then evenly spaced chapters,
 *    skipping essay-style chapters and anything flagged for graphic content (see adventureMap.ts).
 * 2. Asks the model (Batch API) to place one choice point in each chapter, shown with paragraph ids.
 * 3. Re-validates every anchor, rejoin and character in code; rejected proposals are reported.
 *
 *   npm run content:maps                    # all books
 *   npm run content:maps -- --book alice
 *
 * Re-running bumps the map version, which invalidates cached detours for that book.
 * Without ANTHROPIC_API_KEY it writes a mechanical placeholder map (for tests and local dev).
 */
import path from "node:path";
import {
  castAvailableAt,
  CHOICE_POINT_CAPS,
  MAX_SKIPPED_PARAGRAPHS,
  MIN_INTRO_WORDS,
  normalizeChoicePoint,
  selectChapters,
} from "../lib/content/adventureMap";
import { countWords } from "../lib/content/chunk";
import { ADVENTURE_MAP_SYSTEM, adventureMapUser } from "../lib/prompts/offline";
import {
  AdventureMapSchema,
  ChoicePointOutputSchema,
  type ChoicePoint,
  type ChoicePointOutput,
} from "../lib/schemas/adventure";
import {
  BookMetaSchema,
  ChapterSchema,
  CharactersSchema,
  SummariesSchema,
  TocSchema,
  type Chapter,
  type Character,
} from "../lib/schemas/content";
import { runBatch } from "./lib/batch";
import { bookDir, booksFromArgs, readJson, writeJson, type ScriptBookId } from "./lib/paths";

/** Mechanical stand-in used without an API key: valid structure, obviously not real content. */
function placeholderChoicePoint(
  ch: Chapter,
  cast: Character[],
  isIntro: boolean,
): ChoicePointOutput {
  const paras = ch.paragraphs;
  let words = 0;
  let anchor = Math.floor(paras.length / 2);
  if (isIntro) {
    for (let i = 0; i < paras.length; i++) {
      words += countWords(paras[i].text);
      if (words >= MIN_INTRO_WORDS) {
        anchor = i;
        break;
      }
    }
  }
  anchor = Math.min(anchor, paras.length - 3);
  let rejoin = anchor + 2;
  while (paras[rejoin]?.kind === "break") rejoin++;
  const opt = (n: number) => ({
    label: `[Placeholder] Try path ${n}`,
    detourBrief: `Placeholder detour ${n}: a short side moment that leads back to the original text.`,
    mustPreserve: [],
  });
  const available = castAvailableAt(cast, ch.index).map((c) => c.id);
  return {
    anchorAfter: paras[anchor].id,
    rejoinAt: paras[Math.min(rejoin, anchor + 1 + MAX_SKIPPED_PARAGRAPHS)].id,
    prompt: "[Placeholder] What would you like to do next?",
    availableCharacters: available,
    plotOptions: [opt(1), opt(2), opt(3)],
    characterOptions: available.map((id) => ({ characterId: id, options: [opt(1), opt(2)] })),
  };
}

async function processBook(id: ScriptBookId) {
  const dir = bookDir(id);
  const meta = BookMetaSchema.parse(await readJson(path.join(dir, "meta.json")));
  const toc = TocSchema.parse(await readJson(path.join(dir, "toc.json")));
  const summaries = SummariesSchema.parse(await readJson(path.join(dir, "summaries.json")));
  const { characters: cast } = CharactersSchema.parse(
    await readJson(path.join(dir, "characters.json")),
  );
  if (summaries.chapters.some((s) => s.generatedBy === "placeholder")) {
    console.warn(`${id}: summaries contain placeholders; chapter selection will be naive.`);
  }

  const wordCounts = new Map(toc.chapters.map((c) => [c.index, c.wordCount]));
  const picks = selectChapters(id, summaries.chapters, wordCounts, CHOICE_POINT_CAPS[id] ?? 20);
  console.log(`${id}: ${picks.length} choice points in chapters ${picks.join(", ")}`);

  const chapters = new Map<number, Chapter>();
  for (const index of picks) {
    chapters.set(
      index,
      ChapterSchema.parse(
        await readJson(path.join(dir, "chapters", `${String(index).padStart(3, "0")}.json`)),
      ),
    );
  }

  const run = await runBatch(
    `map-${id}`,
    picks.map((index) => {
      const ch = chapters.get(index)!;
      const isIntro = index === picks[0];
      const castHere = castAvailableAt(cast, index);
      return {
        customId: `${id}-c${index}`,
        system: ADVENTURE_MAP_SYSTEM,
        user: adventureMapUser({
          bookTitle: meta.title,
          chapter: ch,
          chapterSummary: summaries.chapters.find((s) => s.index === index)?.summary ?? "",
          cast: castHere,
          isIntro,
          minIntroWords: MIN_INTRO_WORDS,
        }),
        schema: ChoicePointOutputSchema,
        maxTokens: 6000,
        placeholder: () => placeholderChoicePoint(ch, cast, isIntro),
      };
    }),
  );

  const choicePoints: ChoicePoint[] = [];
  for (const index of picks) {
    const out = run.results.get(`${id}-c${index}`);
    if (!out) {
      console.warn(`  ✗ chapter ${index}: no result`);
      continue;
    }
    const isIntro = choicePoints.length === 0;
    const res = normalizeChoicePoint(out, {
      chapter: chapters.get(index)!,
      cast,
      id: `cp${String(choicePoints.length + 1).padStart(2, "0")}`,
      isIntro,
    });
    if (res.ok) {
      choicePoints.push(res.cp);
      if (res.repairs.length)
        console.log(`  ~ chapter ${index}: ${[...new Set(res.repairs)].join("; ")}`);
    } else {
      console.warn(`  ✗ chapter ${index} rejected: ${res.errors.join("; ")}`);
    }
  }

  const mapFile = path.join(dir, "adventure-map.json");
  const previous = await readJson<{ version?: number }>(mapFile).catch(() => ({ version: 0 }));
  const map = AdventureMapSchema.parse({
    bookId: id,
    version: (previous.version ?? 0) + 1,
    generatedBy: run.generatedBy,
    choicePoints,
  });
  await writeJson(mapFile, map);
  const withChars = choicePoints.filter((c) => c.availableCharacters.length).length;
  console.log(
    `${id}: wrote v${map.version} with ${choicePoints.length} choice points (${withChars} with character options)`,
  );
}

async function main() {
  for (const id of booksFromArgs()) await processBook(id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
