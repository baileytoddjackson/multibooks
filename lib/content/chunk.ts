/**
 * Pure text-processing helpers for the Gutenberg → chapter JSON pipeline.
 * Kept free of fs/network so they can be unit tested.
 */

export interface Paragraph {
  /** Stable id, e.g. "c03p017". Used as canon anchors by adventure maps. */
  id: string;
  /** Text with `_emphasis_` markers preserved; verse keeps "\n" line breaks. */
  text: string;
  kind?: "verse" | "break";
}

export interface ChapterJson {
  bookId: string;
  index: number; // 1-based
  title: string;
  /** Optional subtitle (Odyssey book summaries, Alice chapter names). */
  subtitle?: string;
  paragraphs: Paragraph[];
  /** Indices into `paragraphs` where each reader page starts. Always begins with 0. */
  pageStarts: number[];
  wordCount: number;
}

const START_RE = /^\*\*\* START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*\*\*\*\s*$/m;
const END_RE = /^\*\*\* END OF (THE|THIS) PROJECT GUTENBERG EBOOK.*\*\*\*\s*$/m;

/** Returns only the book body between the Gutenberg START/END markers. */
export function stripGutenbergBoilerplate(raw: string): string {
  const text = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const start = text.match(START_RE);
  const end = text.match(END_RE);
  if (!start || start.index === undefined || !end || end.index === undefined) {
    throw new Error("Gutenberg START/END markers not found");
  }
  return text.slice(start.index + start[0].length, end.index).trim();
}

export function countWords(s: string): number {
  const m = s.replace(/_/g, "").match(/[\p{L}\p{N}’']+/gu);
  return m ? m.length : 0;
}

const BREAK_RE = /^\s*(\*\s*){3,}\s*$/;
const ILLUSTRATION_RE = /^\s*\[Illustration[^\]]*\]\s*$/i;
const INLINE_FOOTNOTE_RE = /\s?\[\d{1,3}\]/g;

/** Splits a chapter body into paragraphs, unwrapping hard-wrapped prose and keeping verse. */
export function splitParagraphs(body: string): Omit<Paragraph, "id">[] {
  const blocks = body
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+$/g, ""))
    .filter((b) => b.trim().length > 0 && !ILLUSTRATION_RE.test(b));

  const out: Omit<Paragraph, "id">[] = [];
  for (const block of blocks) {
    if (BREAK_RE.test(block)) {
      if (out.length && out[out.length - 1].kind !== "break") out.push({ text: "", kind: "break" });
      continue;
    }
    const lines = block.split("\n");
    if (isVerse(lines)) {
      const minIndent = Math.min(...lines.map((l) => l.match(/^ */)![0].length));
      out.push({
        text: lines.map((l) => l.slice(minIndent).replace(/\s+$/, "")).join("\n"),
        kind: "verse",
      });
    } else {
      out.push({
        text: lines
          .map((l) => l.trim())
          .join(" ")
          .replace(INLINE_FOOTNOTE_RE, "")
          .replace(/\s{2,}/g, " ")
          .trim(),
      });
    }
  }
  return out;
}

/**
 * Verse heuristic: several short lines where some are indented relative to others
 * (Carroll's poems), or every line is indented. Normal wrapped prose has uniform ~70-char lines.
 */
function isVerse(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const indents = lines.map((l) => l.match(/^ */)![0].length);
  const allIndented = indents.every((i) => i >= 2);
  const mixedIndent = new Set(indents).size > 1 && Math.max(...indents) >= 2;
  const shortLines = lines.every((l) => l.trim().length <= 60);
  return shortLines && (allIndented || mixedIndent);
}

/** Groups paragraphs into reader pages of roughly `targetWords`, never splitting a paragraph. */
export function paginate(paragraphs: Pick<Paragraph, "text">[], targetWords = 650): number[] {
  const starts = [0];
  let words = 0;
  paragraphs.forEach((p, i) => {
    const w = countWords(p.text);
    if (words > 0 && words + w > targetWords * 1.25 && words >= targetWords * 0.6) {
      starts.push(i);
      words = 0;
    }
    words += w;
  });
  // Avoid a tiny final page: merge it into the previous one.
  if (starts.length > 1) {
    const last = starts[starts.length - 1];
    const tail = paragraphs.slice(last).reduce((n, p) => n + countWords(p.text), 0);
    if (tail < targetWords * 0.3) starts.pop();
  }
  return starts;
}

export function paragraphId(chapterIndex: number, paragraphIndex: number): string {
  return `c${String(chapterIndex).padStart(3, "0")}p${String(paragraphIndex + 1).padStart(3, "0")}`;
}

export function parseParagraphId(id: string): { chapter: number; paragraph: number } | null {
  const m = /^c(\d{3})p(\d{3})$/.exec(id);
  return m ? { chapter: Number(m[1]), paragraph: Number(m[2]) - 1 } : null;
}

export interface RawChapter {
  title: string;
  subtitle?: string;
  body: string;
}

export function buildChapter(bookId: string, index: number, raw: RawChapter): ChapterJson {
  const paras = splitParagraphs(raw.body);
  const paragraphs = paras.map((p, i) => ({ id: paragraphId(index, i), ...p }));
  return {
    bookId,
    index,
    title: raw.title,
    ...(raw.subtitle ? { subtitle: raw.subtitle } : {}),
    paragraphs,
    pageStarts: paginate(paragraphs),
    wordCount: paragraphs.reduce((n, p) => n + countWords(p.text), 0),
  };
}

/**
 * Generic heading-based splitter. `headingRe` must match a heading line (multiline flag).
 * `skipUntil` drops everything before the first heading at/after that offset (e.g. a contents list).
 */
export function splitByHeadings(
  body: string,
  headingRe: RegExp,
  opts: { skipUntil?: number } = {},
): { heading: string; text: string }[] {
  const re = new RegExp(
    headingRe.source,
    headingRe.flags.includes("g") ? headingRe.flags : headingRe.flags + "g",
  );
  const matches = [...body.matchAll(re)].filter((m) => (m.index ?? 0) >= (opts.skipUntil ?? 0));
  return matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    return { heading: m[0].trim(), text: body.slice(start, end).replace(/^\n+/, "") };
  });
}

/**
 * Removes footnote markers written as digits glued to the end of a word or punctuation
 * ("East.1 He", "Temesa4 with"), as in the Butler Odyssey. Only use for texts that follow
 * this convention: a real number never directly follows a letter there.
 */
export function stripAttachedFootnotes(text: string): string {
  return text.replace(/([\p{L}”’.,;:!?])\d{1,3}(?=[\s.,;:!?”’—)]|$)/gmu, "$1").replace(/—-/g, "—");
}
