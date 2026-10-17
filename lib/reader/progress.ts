import { countWords } from "@/lib/content/chunk";
import type { Chapter, Toc } from "@/lib/schemas/content";

/** Paragraph range [start, end) shown on a given page of a chapter. */
export function pageRange(chapter: Pick<Chapter, "pageStarts" | "paragraphs">, page: number) {
  const start = chapter.pageStarts[page] ?? 0;
  const end = chapter.pageStarts[page + 1] ?? chapter.paragraphs.length;
  return { start, end };
}

export function pageCount(chapter: Pick<Chapter, "pageStarts">) {
  return chapter.pageStarts.length;
}

export function pageWords(chapter: Pick<Chapter, "pageStarts" | "paragraphs">, page: number) {
  const { start, end } = pageRange(chapter, page);
  return chapter.paragraphs.slice(start, end).reduce((n, p) => n + countWords(p.text), 0);
}

/** Which page contains a paragraph id (falls back to page 0). */
export function pageForParagraph(chapter: Pick<Chapter, "pageStarts" | "paragraphs">, id: string) {
  const idx = chapter.paragraphs.findIndex((p) => p.id === id);
  if (idx < 0) return 0;
  let page = 0;
  chapter.pageStarts.forEach((s, i) => {
    if (s <= idx) page = i;
  });
  return page;
}

/** Whole-book reading fraction (0..1) at the *end* of the given page. */
export function bookFraction(
  toc: Pick<Toc, "chapters" | "totalWords">,
  chapter: Pick<Chapter, "index" | "pageStarts" | "paragraphs">,
  page: number,
) {
  const entry = toc.chapters.find((c) => c.index === chapter.index);
  if (!entry || toc.totalWords === 0) return 0;
  let words = entry.wordsBefore;
  for (let p = 0; p <= page && p < chapter.pageStarts.length; p++) words += pageWords(chapter, p);
  return Math.min(1, words / toc.totalWords);
}

/** Splits `_emphasis_` markers into text/em runs for rendering without dangerouslySetInnerHTML. */
export function emphasisRuns(text: string): { text: string; em: boolean }[] {
  const runs: { text: string; em: boolean }[] = [];
  const re = /_([^_\n]+)_/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) runs.push({ text: text.slice(last, m.index), em: false });
    runs.push({ text: m[1], em: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), em: false });
  return runs;
}
