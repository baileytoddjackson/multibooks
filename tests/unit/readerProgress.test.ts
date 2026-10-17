import { describe, expect, it } from "vitest";
import {
  bookFraction,
  emphasisRuns,
  pageForParagraph,
  pageRange,
  pageWords,
} from "@/lib/reader/progress";

const words = (n: number) => Array(n).fill("w").join(" ");
const chapter = {
  index: 2,
  pageStarts: [0, 2],
  paragraphs: [
    { id: "c002p001", text: words(100) },
    { id: "c002p002", text: words(100) },
    { id: "c002p003", text: words(50) },
  ],
};
const toc = {
  totalWords: 1000,
  chapters: [
    { index: 1, title: "One", wordCount: 750, pages: 2, wordsBefore: 0 },
    { index: 2, title: "Two", wordCount: 250, pages: 2, wordsBefore: 750 },
  ],
};

describe("reader progress", () => {
  it("computes page ranges and words", () => {
    expect(pageRange(chapter, 0)).toEqual({ start: 0, end: 2 });
    expect(pageRange(chapter, 1)).toEqual({ start: 2, end: 3 });
    expect(pageWords(chapter, 0)).toBe(200);
  });

  it("finds the page holding a paragraph", () => {
    expect(pageForParagraph(chapter, "c002p003")).toBe(1);
    expect(pageForParagraph(chapter, "nope")).toBe(0);
  });

  it("computes whole-book fraction at the end of a page", () => {
    expect(bookFraction(toc, chapter, 0)).toBeCloseTo(0.95);
    expect(bookFraction(toc, chapter, 1)).toBe(1);
  });

  it("splits emphasis markers", () => {
    expect(emphasisRuns("so _very_ odd")).toEqual([
      { text: "so ", em: false },
      { text: "very", em: true },
      { text: " odd", em: false },
    ]);
  });
});
