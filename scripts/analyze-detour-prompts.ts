/**
 * Stress test: builds every possible detour prompt (choice point × option × perspective) and
 * reports its size, so we can see where long chapters and big casts strain the context.
 * Uses the free token-counting endpoint when ANTHROPIC_API_KEY is set (otherwise estimates).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/analyze-detour-prompts.ts [--book moby-dick]
 */
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { countWords } from "../lib/content/chunk";
import { DEFAULT_MODEL } from "../lib/llm/models";
import { outputFormat } from "../lib/llm/structured";
import { buildDetourPrompt } from "../lib/prompts/detour";
import { AdventureMapSchema } from "../lib/schemas/adventure";
import {
  BookMetaSchema,
  ChapterSchema,
  CharactersSchema,
  SummariesSchema,
} from "../lib/schemas/content";
import { bookDir, booksFromArgs, readJson } from "./lib/paths";

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : undefined;
const model = process.env.MODEL_RUNTIME || DEFAULT_MODEL;

async function count(system: string, user: string, schema: Parameters<typeof outputFormat>[0]) {
  if (!client) return Math.round((system.length + user.length) / 4);
  const r = await client.messages.countTokens({
    model,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: outputFormat(schema) },
  } as Anthropic.MessageCountTokensParams);
  return r.input_tokens;
}

async function main() {
  for (const id of booksFromArgs()) {
    const dir = bookDir(id);
    const book = BookMetaSchema.parse(await readJson(path.join(dir, "meta.json")));
    const map = AdventureMapSchema.parse(await readJson(path.join(dir, "adventure-map.json")));
    const summaries = SummariesSchema.parse(await readJson(path.join(dir, "summaries.json")));
    const cast = CharactersSchema.parse(
      await readJson(path.join(dir, "characters.json")),
    ).characters;

    const rows: { cp: string; perspective: string; tokens: number; replacedWords: number }[] = [];
    for (const cp of map.choicePoints) {
      const chapter = ChapterSchema.parse(
        await readJson(path.join(dir, "chapters", `${String(cp.chapter).padStart(3, "0")}.json`)),
      );
      const a = chapter.paragraphs.findIndex((p) => p.id === cp.anchorAfter);
      const r = chapter.paragraphs.findIndex((p) => p.id === cp.rejoinAt);
      const replacedWords = chapter.paragraphs
        .slice(a + 1, r)
        .reduce((n, p) => n + countWords(p.text), 0);
      // One prompt per perspective is enough: options differ only by a short brief.
      for (const perspective of ["narrator", ...cp.availableCharacters]) {
        const option =
          perspective === "narrator" ? cp.plotOptions[0] : cp.characterOptions[perspective][0];
        const prompt = buildDetourPrompt({
          book,
          chapter,
          chapterSummary: summaries.chapters.find((s) => s.index === cp.chapter)?.summary ?? "",
          previousSummary: summaries.chapters.find((s) => s.index === cp.chapter - 1)?.summary,
          cp,
          option,
          character: cast.find((c) => c.id === perspective),
        });
        rows.push({
          cp: cp.id,
          perspective,
          tokens: await count(prompt.system, prompt.user, prompt.schema),
          replacedWords,
        });
      }
    }

    const tokens = rows.map((r) => r.tokens).sort((x, y) => x - y);
    const avg = Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length);
    const p95 = tokens[Math.floor(tokens.length * 0.95)];
    const combos = map.choicePoints.reduce(
      (n, cp) =>
        n +
        cp.plotOptions.length +
        Object.values(cp.characterOptions).flat().length * 1 +
        cp.plotOptions.length * cp.availableCharacters.length,
      0,
    );
    console.log(
      `\n${id}: ${rows.length} prompts sampled${client ? "" : " (estimated)"} | input tokens avg ${avg}, p95 ${p95}, max ${tokens.at(-1)}`,
    );
    console.log(`  possible detours in this book (all options × perspectives): ~${combos}`);
    const worst = [...rows].sort((x, y) => y.tokens - x.tokens).slice(0, 3);
    for (const w of worst) {
      console.log(
        `  largest: ${w.cp} as ${w.perspective}: ${w.tokens} tokens (detour replaces ${w.replacedWords} original words)`,
      );
    }
    const heavy = [...new Map(rows.map((r) => [r.cp, r])).values()].filter(
      (r) => r.replacedWords > 500,
    );
    if (heavy.length) {
      console.log(
        `  ⚠ ${heavy.length} choice point(s) replace >500 original words: ${heavy.map((h) => `${h.cp} (${h.replacedWords})`).join(", ")}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
