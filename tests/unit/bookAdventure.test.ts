import { describe, expect, it } from "vitest";
import { detourCacheKey, parseDetourCacheKey } from "@/lib/engine/cacheKey";
import {
  choiceView,
  choose,
  EMPTY_ADVENTURE,
  layoutPage,
  returnToOriginal,
  setDetourText,
  setStyle,
  undo,
  type PageBlock,
} from "@/lib/engine/bookAdventure";
import type { AdventureMap, ChoicePoint } from "@/lib/schemas/adventure";

const opt = (id: string) => ({
  id,
  label: `Label ${id}`,
  detourBrief: "brief text here",
  mustPreserve: [],
});
const cp: ChoicePoint = {
  id: "cp01",
  chapter: 1,
  anchorAfter: "c001p003",
  rejoinAt: "c001p006",
  prompt: "What next?",
  isIntro: true,
  availableCharacters: ["alice"],
  plotOptions: [opt("p1"), opt("p2"), opt("p3")],
  characterOptions: { alice: [opt("alice-1"), opt("alice-2")] },
};
const map: AdventureMap = { bookId: "alice", version: 1, generatedBy: "test", choicePoints: [cp] };
const chapter = {
  index: 1,
  paragraphs: Array.from({ length: 10 }, (_, i) => ({
    id: `c001p${String(i + 1).padStart(3, "0")}`,
    text: `P${i + 1}`,
  })),
};
const ids = (blocks: PageBlock[]) =>
  blocks.map((b) => (b.type === "canon" ? b.paragraphs.map((p) => p.text).join(",") : b.type));

describe("detour cache key", () => {
  it("is deterministic, versioned and round-trips", () => {
    const parts = {
      bookId: "moby-dick",
      mapVersion: 3,
      cpId: "cp07",
      optionId: "ahab-2",
      perspective: "ahab",
    };
    const key = detourCacheKey(parts, 2);
    expect(key).toBe("detour:v2:moby-dick:m3:cp07:ahab-2:ahab");
    expect(detourCacheKey(parts, 2)).toBe(key);
    expect(detourCacheKey(parts, 3)).not.toBe(key);
    expect(parseDetourCacheKey(key)).toEqual({ ...parts, promptVersion: 2 });
  });

  it("rejects unsafe parts", () => {
    expect(() =>
      detourCacheKey({
        bookId: "alice",
        mapVersion: 1,
        cpId: "cp01",
        optionId: "p1:x",
        perspective: "narrator",
      }),
    ).toThrow();
  });
});

describe("choiceView", () => {
  it("maps each style to options and perspective", () => {
    expect(choiceView(cp, "direct", undefined)).toMatchObject({
      perspective: "narrator",
      options: cp.plotOptions,
    });
    expect(choiceView(cp, "character", "alice").perspective).toBe("alice");
    expect(choiceView(cp, "character", "alice").options.map((o) => o.id)).toEqual([
      "alice-1",
      "alice-2",
    ]);
    expect(choiceView(cp, "both", "alice").options.map((o) => o.id)).toEqual([
      "alice-1",
      "alice-2",
      "p1",
    ]);
  });

  it("falls back to the narrator when the character isn't in the scene", () => {
    const v = choiceView(cp, "character", "hatter", "the Hatter");
    expect(v.perspective).toBe("narrator");
    expect(v.options).toBe(cp.plotOptions);
    expect(v.narratorFallbackNote).toMatch(/the Hatter/);
  });
});

describe("layoutPage", () => {
  const whole = { start: 0, end: 10 };

  it("stops at an unresolved choice", () => {
    const { blocks, blocked } = layoutPage(chapter, whole, map, EMPTY_ADVENTURE);
    expect(blocked).toBe(true);
    expect(ids(blocks)).toEqual(["P1,P2,P3", "choice"]);
  });

  it("shows the detour, hides replaced paragraphs, and rejoins canon", () => {
    let s = choose(EMPTY_ADVENTURE, cp, cp.plotOptions[1], choiceView(cp, "direct", undefined));
    s = setDetourText(s, "cp01", ["Detour text."]);
    const { blocks, blocked } = layoutPage(chapter, whole, map, s);
    expect(blocked).toBe(false);
    expect(ids(blocks)).toEqual(["P1,P2,P3", "detour", "P6,P7,P8,P9,P10"]);
  });

  it("hides replaced paragraphs that spill onto the next page", () => {
    const s = choose(EMPTY_ADVENTURE, cp, cp.plotOptions[0], choiceView(cp, "direct", undefined));
    expect(ids(layoutPage(chapter, { start: 4, end: 10 }, map, s).blocks)).toEqual([
      "P6,P7,P8,P9,P10",
    ]);
  });

  it("blocks later pages until an earlier choice is made", () => {
    const { blocks, blocked } = layoutPage(chapter, { start: 5, end: 10 }, map, EMPTY_ADVENTURE);
    expect(blocked).toBe(true);
    expect(blocks[0].type).toBe("choice");
  });

  it("keeps the original text when the reader returns to it", () => {
    const s = returnToOriginal(EMPTY_ADVENTURE, "cp01");
    expect(ids(layoutPage(chapter, whole, map, s).blocks)).toEqual([
      "P1,P2,P3,P4,P5,P6,P7,P8,P9,P10",
    ]);
  });
});

describe("history", () => {
  it("undo pops the last choice so it can be made again", () => {
    let s = setStyle(EMPTY_ADVENTURE, "character", "alice");
    s = choose(s, cp, cp.characterOptions.alice[0], choiceView(cp, s.style, s.characterId));
    const { state, cpId } = undo(s);
    expect(cpId).toBe("cp01");
    expect(state.history).toHaveLength(0);
    expect(state.style).toBe("character");
    expect(layoutPage(chapter, { start: 0, end: 10 }, map, state).blocked).toBe(true);
    expect(undo(state).cpId).toBeUndefined();
  });

  it("returning to the original from a detour replaces it rather than stacking", () => {
    let s = choose(EMPTY_ADVENTURE, cp, cp.plotOptions[0], choiceView(cp, "direct", undefined));
    s = returnToOriginal(s, "cp01");
    expect(s.history).toEqual([{ cpId: "cp01", kind: "original" }]);
  });

  it("switching to direct clears the character", () => {
    expect(
      setStyle(setStyle(EMPTY_ADVENTURE, "both", "alice"), "direct").characterId,
    ).toBeUndefined();
  });
});
