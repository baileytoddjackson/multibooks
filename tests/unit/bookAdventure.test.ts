import { describe, expect, it } from "vitest";
import {
  adventureAvailable,
  choiceView,
  entryChoicePoint,
  layoutEntryPage,
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
  anchorAfter: "c001p006",
  rejoinAt: "c001p008",
  prompt: "What next?",
  isIntro: true,
  availableCharacters: ["alice"],
  plotOptions: [opt("p1"), opt("p2"), opt("p3")],
  characterOptions: { alice: [opt("alice-1"), opt("alice-2")] },
};
const chapter = {
  index: 1,
  paragraphs: Array.from({ length: 10 }, (_, i) => ({
    id: `c001p${String(i + 1).padStart(3, "0")}`,
    text: `P${i + 1}`,
  })),
};
const texts = (blocks: ReturnType<typeof layoutEntryPage>["blocks"]) =>
  blocks.map((b) => (b.type === "canon" ? b.paragraphs.map((p) => p.text).join(",") : b.type));

describe("entryChoicePoint", () => {
  it("picks the intro choice point", () => {
    const later = { ...cp, id: "cp02", chapter: 3, isIntro: false };
    const map: AdventureMap = {
      bookId: "alice",
      version: 1,
      generatedBy: "test",
      choicePoints: [later, cp],
    };
    expect(entryChoicePoint(map)?.id).toBe("cp01");
    expect(entryChoicePoint({ ...map, choicePoints: [later] })?.id).toBe("cp02");
    expect(entryChoicePoint(undefined)).toBeUndefined();
  });
});

describe("choiceView", () => {
  it("maps each style to options and perspective", () => {
    expect(choiceView(cp, "direct", undefined).perspective).toBe("narrator");
    expect(choiceView(cp, "direct", undefined).options.map((o) => o.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    const asAlice = choiceView(cp, "character", "alice");
    expect(asAlice.perspective).toBe("alice");
    expect(asAlice.options.map((o) => o.id)).toEqual(["alice-1", "alice-2"]);
    expect(choiceView(cp, "both", "alice").options.map((o) => o.id)).toEqual([
      "alice-1",
      "alice-2",
      "p1",
    ]);
  });

  it("falls back to the narrator when the character isn't in the scene", () => {
    const v = choiceView(cp, "character", "hatter", "the Hatter");
    expect(v.perspective).toBe("narrator");
    expect(v.options[0].id).toBe("p1");
    expect(v.narratorFallbackNote).toContain("the Hatter");
  });
});

describe("layoutEntryPage", () => {
  it("shows the original text on pages before the choice", () => {
    const r = layoutEntryPage(chapter, { start: 0, end: 4 }, cp);
    expect(r.blocked).toBe(false);
    expect(texts(r.blocks)).toEqual(["P1,P2,P3,P4"]);
  });

  it("stops at the choice: nothing after it is shown", () => {
    const r = layoutEntryPage(chapter, { start: 4, end: 10 }, cp);
    expect(r.blocked).toBe(true);
    expect(texts(r.blocks)).toEqual(["P5,P6", "choice"]);
  });

  it("blocks later pages with the choice alone", () => {
    const r = layoutEntryPage(chapter, { start: 8, end: 10 }, cp);
    expect(r.blocked).toBe(true);
    expect(texts(r.blocks)).toEqual(["choice"]);
  });

  it("reads as written in other chapters or without an entry", () => {
    const ch2 = { ...chapter, index: 2 };
    expect(layoutEntryPage(ch2, { start: 0, end: 10 }, cp).blocked).toBe(false);
    expect(layoutEntryPage(chapter, { start: 0, end: 10 }, undefined).blocked).toBe(false);
  });
});

describe("adventureAvailable", () => {
  const map: AdventureMap = {
    bookId: "alice",
    version: 1,
    generatedBy: "model",
    choicePoints: [cp],
  };
  const real = { chapters: [{ generatedBy: "model" }] };

  it("needs a real entry choice and real summaries", () => {
    expect(adventureAvailable(map, real)).toBe(true);
    // Content written without an API key never reaches readers.
    expect(adventureAvailable({ ...map, generatedBy: "placeholder" }, real)).toBe(false);
    expect(entryChoicePoint({ ...map, generatedBy: "placeholder" })).toBeUndefined();
    expect(adventureAvailable(map, { chapters: [{ generatedBy: "placeholder" }] })).toBe(false);
    expect(adventureAvailable(undefined, real)).toBe(false);
    expect(adventureAvailable(map, { chapters: [] })).toBe(false);
  });
});
