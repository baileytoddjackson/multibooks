/**
 * Gutenberg plain text → cleaned chapter JSON + table of contents, committed to content/books.
 *
 *   npm run content:chunk               # all books
 *   npm run content:chunk -- --book odyssey
 *
 * Paragraph ids (c003p017) are stable as long as the source text and these rules don't change.
 * Adventure maps anchor to them, so re-run `npm run content:validate` after any change here.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildChapter,
  splitByHeadings,
  stripAttachedFootnotes,
  stripGutenbergBoilerplate,
  type ChapterJson,
  type RawChapter,
} from "../lib/content/chunk";
import { bookDir, booksFromArgs, rawPath, writeJson, type ScriptBookId } from "./lib/paths";

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/** "THE GODS IN COUNCIL—MINERVA’S VISIT" → "The Gods in Council—Minerva’s Visit" */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(/(—|\s)/)
    .map((w, i, arr) => {
      const prev = arr
        .slice(0, i)
        .filter((x) => x.trim())
        .pop();
      const first = i === 0 || prev === "—";
      if (!first && SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("")
    .replace(/\.$/, "");
}

function firstBlock(text: string): { block: string; rest: string } {
  const m = text.match(/^\s*([\s\S]*?)\n\s*\n([\s\S]*)$/);
  return m ? { block: m[1].trim(), rest: m[2] } : { block: text.trim(), rest: "" };
}

const EXTRACTORS: Record<ScriptBookId, (body: string) => RawChapter[]> = {
  alice(body) {
    // Contents lines are indented (" CHAPTER I."); real headings start at column 0.
    return splitByHeadings(body, /^CHAPTER [IVXL]+\.$/m).map(({ text }) => {
      const { block, rest } = firstBlock(text);
      return { title: block, body: rest };
    });
  },

  odyssey(body) {
    // Drop the translator's prefaces (before BOOK I) and the footnotes section at the end.
    const footnotes = body.search(/^FOOTNOTES:\s*$/m);
    const main = stripAttachedFootnotes(footnotes > 0 ? body.slice(0, footnotes) : body);
    return splitByHeadings(main, /^BOOK [IVXL]+$/m).map(({ heading, text }) => {
      const { block, rest } = firstBlock(text);
      return { title: heading.replace(/^BOOK/, "Book"), subtitle: titleCase(block), body: rest };
    });
  },

  "moby-dick"(body) {
    // The contents list repeats every heading at column 0, so start at the *second* "CHAPTER 1.".
    // Etymology / Extracts front matter is intentionally skipped for this audience.
    const firstHeadings = [...body.matchAll(/^CHAPTER 1\. Loomings\.\s*$/gm)];
    if (firstHeadings.length < 2) throw new Error("Moby-Dick: could not find chapter 1 body");
    const start = firstHeadings[1].index!;
    return splitByHeadings(body, /^(CHAPTER \d+\. .+|Epilogue)$/m, { skipUntil: start }).map(
      ({ heading, text }) => {
        const m = /^CHAPTER \d+\. (.+?)\.?$/.exec(heading);
        return { title: m ? m[1] : heading, body: text };
      },
    );
  },
};

export interface TocJson {
  bookId: string;
  totalWords: number;
  chapters: {
    index: number;
    title: string;
    subtitle?: string;
    wordCount: number;
    pages: number;
    /** Cumulative words before this chapter, for whole-book progress. */
    wordsBefore: number;
  }[];
}

async function processBook(id: ScriptBookId) {
  const raw = await fs.readFile(rawPath(id), "utf8").catch(() => {
    throw new Error(`Missing ${rawPath(id)}. Run \`npm run content:fetch\` first.`);
  });
  const chapters: ChapterJson[] = EXTRACTORS[id](stripGutenbergBoilerplate(raw)).map((c, i) =>
    buildChapter(id, i + 1, c),
  );

  const dir = path.join(bookDir(id), "chapters");
  await fs.rm(dir, { recursive: true, force: true });
  let wordsBefore = 0;
  const toc: TocJson = { bookId: id, totalWords: 0, chapters: [] };
  for (const ch of chapters) {
    await writeJson(path.join(dir, `${String(ch.index).padStart(3, "0")}.json`), ch);
    toc.chapters.push({
      index: ch.index,
      title: ch.title,
      ...(ch.subtitle ? { subtitle: ch.subtitle } : {}),
      wordCount: ch.wordCount,
      pages: ch.pageStarts.length,
      wordsBefore,
    });
    wordsBefore += ch.wordCount;
  }
  toc.totalWords = wordsBefore;
  await writeJson(path.join(bookDir(id), "toc.json"), toc);

  const minutes = Math.round(toc.totalWords / 150);
  console.log(
    `${id}: ${chapters.length} chapters, ${toc.totalWords.toLocaleString()} words (~${minutes} min at 150 wpm)`,
  );
}

async function main() {
  for (const id of booksFromArgs()) await processBook(id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
