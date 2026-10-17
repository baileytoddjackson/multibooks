import { describe, expect, it } from "vitest";
import {
  isEligibleChapter,
  normalizeChoicePoint,
  selectChapters,
  validateMap,
} from "@/lib/content/adventureMap";
import type { ChoicePointOutput } from "@/lib/schemas/adventure";
import type { Chapter, Character } from "@/lib/schemas/content";

const words = (n: number) => Array(n).fill("word").join(" ");
const chapter: Chapter = {
  bookId: "alice",
  index: 2,
  title: "T",
  pageStarts: [0],
  wordCount: 0,
  paragraphs: Array.from({ length: 12 }, (_, i) => ({
    id: `c002p${String(i + 1).padStart(3, "0")}`,
    text: words(100),
  })),
};
const cast: Character[] = [
  {
    id: "alice",
    name: "Alice",
    alsoKnownAs: [],
    oneLine: "x",
    profile: "x",
    voiceNotes: "x",
    firstAppearsChapter: 1,
    pov: "third",
  },
  {
    id: "hatter",
    name: "the Hatter",
    alsoKnownAs: [],
    oneLine: "x",
    profile: "x",
    voiceNotes: "x",
    firstAppearsChapter: 7,
    pov: "third",
  },
];
const opt = {
  label: "Open the door.",
  detourBrief: "Alice opens the door and peeks.",
  mustPreserve: ["a", "b", "c", "d"],
};
const output = (over: Partial<ChoicePointOutput> = {}): ChoicePointOutput => ({
  anchorAfter: "c002p004",
  rejoinAt: "c002p006",
  prompt: " What should Alice do? ",
  availableCharacters: ["alice", "hatter"],
  plotOptions: [opt, opt, opt, opt],
  characterOptions: [
    { characterId: "alice", options: [opt, opt] },
    { characterId: "hatter", options: [opt, opt] }, // not introduced until chapter 7
  ],
  ...over,
});

describe("chapter selection", () => {
  it("skips essay chapters and curated exclusions", () => {
    expect(isEligibleChapter("odyssey", { index: 22, kind: "narrative" })).toBe(false);
    expect(isEligibleChapter("alice", { index: 8, kind: "narrative" })).toBe(true);
    expect(isEligibleChapter("moby-dick", { index: 32, kind: "essay" })).toBe(false);
  });

  it("always starts with chapter 1 and respects the cap", () => {
    const summaries = Array.from({ length: 30 }, (_, i) => ({
      index: i + 1,
      kind: "narrative" as const,
    }));
    const wc = new Map(summaries.map((s) => [s.index, 2000]));
    const picks = selectChapters("alice", summaries, wc, 5);
    expect(picks[0]).toBe(1);
    expect(picks).toHaveLength(5);
    expect([...picks].sort((a, b) => a - b)).toEqual(picks);
  });
});

describe("normalizeChoicePoint", () => {
  it("keeps only introduced, present characters and trims option lists", () => {
    const res = normalizeChoicePoint(output(), { chapter, cast, id: "cp02", isIntro: false });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cp.availableCharacters).toEqual(["alice"]);
    expect(res.cp.plotOptions.map((o) => o.id)).toEqual(["p1", "p2", "p3"]);
    expect(res.cp.characterOptions.alice.map((o) => o.id)).toEqual(["alice-1", "alice-2"]);
    expect(res.cp.plotOptions[0].label).toBe("Open the door");
    expect(res.cp.plotOptions[0].mustPreserve).toHaveLength(3);
    expect(res.cp.prompt).toBe("What should Alice do?");
  });

  it("rejects bad anchors and over-long detours", () => {
    const missing = normalizeChoicePoint(output({ anchorAfter: "c009p001" }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: false,
    });
    expect(missing.ok).toBe(false);
    const backwards = normalizeChoicePoint(output({ rejoinAt: "c002p003" }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: false,
    });
    // Repaired: rejoin moves to the paragraph right after the anchor.
    expect(backwards.ok && backwards.cp.rejoinAt).toBe("c002p005");
    const tooLong = normalizeChoicePoint(output({ rejoinAt: "c002p012" }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: false,
    });
    expect(tooLong.ok).toBe(false);
  });

  it("requires the intro choice to come after enough original text", () => {
    const early = normalizeChoicePoint(output({ anchorAfter: "c002p002", rejoinAt: "c002p003" }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: true,
    });
    expect(early.ok).toBe(false);
    const late = normalizeChoicePoint(output({ anchorAfter: "c002p009", rejoinAt: "c002p011" }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: true,
    });
    expect(late.ok).toBe(true);
  });
});

describe("validateMap", () => {
  it("accepts a well-formed map and catches ordering and character errors", () => {
    const res = normalizeChoicePoint(output({ anchorAfter: "c002p009", rejoinAt: "c002p011" }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: true,
    });
    if (!res.ok) throw new Error("setup");
    const chapters = new Map([[2, chapter]]);
    const map = {
      bookId: "alice" as const,
      version: 1,
      generatedBy: "test",
      choicePoints: [res.cp],
    };
    expect(validateMap(map, chapters, cast)).toEqual([]);

    const bad = {
      ...res.cp,
      id: "cp02",
      isIntro: false,
      characterOptions: { hatter: res.cp.plotOptions },
    };
    const errors = validateMap({ ...map, choicePoints: [res.cp, bad] }, chapters, cast);
    expect(errors.join(" ")).toMatch(/out of order/);
    expect(errors.join(" ")).toMatch(/hatter not introduced/);
  });
});

describe("normalizeChoicePoint repairs", () => {
  it("moves a rejoin off a scene break", () => {
    const withBreak: Chapter = {
      ...chapter,
      paragraphs: chapter.paragraphs.map((p, i) =>
        i === 5 ? { ...p, text: "", kind: "break" as const } : p,
      ),
    };
    const res = normalizeChoicePoint(output(), {
      chapter: withBreak,
      cast,
      id: "cp01",
      isIntro: false,
    });
    expect(res.ok && res.cp.rejoinAt).toBe("c002p007");
  });

  it("drops invalid options and rejects when too few remain", () => {
    const bad = { label: "Go", detourBrief: "short", mustPreserve: [] };
    const one = normalizeChoicePoint(output({ plotOptions: [opt, bad, opt] }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: false,
    });
    expect(one.ok && one.cp.plotOptions.map((o) => o.id)).toEqual(["p1", "p2"]);
    const none = normalizeChoicePoint(output({ plotOptions: [opt, bad, bad] }), {
      chapter,
      cast,
      id: "cp01",
      isIntro: false,
    });
    expect(none.ok).toBe(false);
  });
});
