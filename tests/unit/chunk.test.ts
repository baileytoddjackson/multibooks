import { describe, expect, it } from "vitest";
import {
  buildChapter,
  countWords,
  paginate,
  paragraphId,
  parseParagraphId,
  splitByHeadings,
  splitParagraphs,
  stripAttachedFootnotes,
  stripGutenbergBoilerplate,
} from "@/lib/content/chunk";

const RAW = `Header junk
*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
Body text here.
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***
License junk`;

describe("stripGutenbergBoilerplate", () => {
  it("keeps only the text between markers", () => {
    expect(stripGutenbergBoilerplate(RAW)).toBe("Body text here.");
  });
  it("throws when markers are missing", () => {
    expect(() => stripGutenbergBoilerplate("no markers")).toThrow();
  });
});

describe("splitParagraphs", () => {
  it("unwraps hard-wrapped prose and strips footnote markers", () => {
    const out = splitParagraphs(
      "So now all who\nescaped death [12] had\ngot home.\n\nNext paragraph.",
    );
    expect(out).toEqual([
      { text: "So now all who escaped death had got home." },
      { text: "Next paragraph." },
    ]);
  });

  it("keeps verse line breaks and relative indentation", () => {
    const verse =
      "“You are old, Father William,” the young man said,\n    “And your hair has become very white;";
    const [p] = splitParagraphs(verse);
    expect(p.kind).toBe("verse");
    expect(p.text.split("\n")[1]).toMatch(/^ {4}“And/);
  });

  it("turns star rows into a single scene break and drops illustrations", () => {
    const out = splitParagraphs("One.\n\n    *      *      *\n\n[Illustration]\n\nTwo.");
    expect(out.map((p) => p.kind ?? "p")).toEqual(["p", "break", "p"]);
  });
});

describe("paginate", () => {
  const para = (n: number) => ({ text: Array(n).fill("word").join(" ") });
  it("starts every chapter on page 0", () => {
    expect(paginate([para(10)])).toEqual([0]);
  });
  it("breaks pages near the target without splitting paragraphs", () => {
    const starts = paginate([para(400), para(400), para(400), para(400)], 650);
    expect(starts[0]).toBe(0);
    expect(starts.length).toBeGreaterThan(1);
  });
  it("merges a tiny trailing page", () => {
    expect(paginate([para(600), para(500), para(20)], 650)).toEqual([0, 1]);
  });
});

describe("paragraph ids", () => {
  it("round-trips", () => {
    expect(paragraphId(3, 16)).toBe("c003p017");
    expect(parseParagraphId("c003p017")).toEqual({ chapter: 3, paragraph: 16 });
    expect(parseParagraphId("bogus")).toBeNull();
  });
});

describe("splitByHeadings / buildChapter", () => {
  it("splits on headings and skips a contents list", () => {
    const body =
      "CHAPTER 1. A.\nCHAPTER 2. B.\n\nCHAPTER 1. A.\n\nFirst.\n\nCHAPTER 2. B.\n\nSecond.";
    const skip = body.lastIndexOf("CHAPTER 1.");
    const parts = splitByHeadings(body, /^CHAPTER \d+\. .+$/m, { skipUntil: skip });
    expect(parts.map((p) => p.text.trim())).toEqual(["First.", "Second."]);
  });

  it("builds ids, pages and word counts", () => {
    const ch = buildChapter("alice", 2, { title: "T", body: "Hello _very_ world.\n\nAgain." });
    expect(ch.paragraphs.map((p) => p.id)).toEqual(["c002p001", "c002p002"]);
    expect(ch.wordCount).toBe(4);
    expect(countWords("_very_ odd’s")).toBe(2);
  });
});

describe("stripAttachedFootnotes", () => {
  it("removes digits glued to words or punctuation", () => {
    expect(stripAttachedFootnotes("looking West and the other East.1 He had")).toBe(
      "looking West and the other East. He had",
    );
    expect(stripAttachedFootnotes("bound for Temesa4 with a cargo")).toBe(
      "bound for Temesa with a cargo",
    );
    expect(stripAttachedFootnotes("THE VISIT TO THE DEAD.88")).toBe("THE VISIT TO THE DEAD.");
  });
  it("leaves standalone numbers and fixes doubled dashes", () => {
    expect(stripAttachedFootnotes("about 20 ships—-gone")).toBe("about 20 ships—gone");
  });
});
