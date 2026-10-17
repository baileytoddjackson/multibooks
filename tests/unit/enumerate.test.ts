import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enumerateDetours } from "@/lib/engine/enumerate";
import { AdventureMapSchema, type ChoicePoint } from "@/lib/schemas/adventure";

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
  rejoinAt: "c001p005",
  prompt: "What next?",
  isIntro: true,
  availableCharacters: ["alice", "rabbit"],
  plotOptions: [opt("p1"), opt("p2"), opt("p3")],
  characterOptions: {
    alice: [opt("alice-1"), opt("alice-2")],
    rabbit: [opt("rabbit-1"), opt("rabbit-2")],
  },
};

describe("enumerateDetours", () => {
  it("lists every reachable option × perspective once", () => {
    const combos = enumerateDetours({
      bookId: "alice",
      version: 1,
      generatedBy: "t",
      choicePoints: [cp],
    });
    const keys = combos.map((c) => `${c.option.id}@${c.perspective}`);
    // 3 narrator plot options + per character: 2 own options + p1 from "both".
    expect(keys).toEqual([
      "p1@narrator",
      "p2@narrator",
      "p3@narrator",
      "alice-1@alice",
      "alice-2@alice",
      "p1@alice",
      "rabbit-1@rabbit",
      "rabbit-2@rabbit",
      "p1@rabbit",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers the committed maps at a sensible size", () => {
    let total = 0;
    for (const book of ["alice", "odyssey", "moby-dick"]) {
      const file = path.resolve(__dirname, `../../content/books/${book}/adventure-map.json`);
      const map = AdventureMapSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
      total += enumerateDetours(map).length;
    }
    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(900);
  });
});
