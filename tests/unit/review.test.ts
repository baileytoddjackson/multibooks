import { describe, expect, it } from "vitest";
import { applyReview, buildReviewEntries, reviewKey } from "@/lib/engine/review";
import { splitSegments } from "@/lib/prompts/detour";
import type { AdventureMap } from "@/lib/schemas/adventure";

const opt = (id: string, brief = "Alice peeks through the door and sees a garden.") => ({
  id,
  label: `Label ${id}`,
  detourBrief: brief,
  mustPreserve: [],
});
const map: AdventureMap = {
  bookId: "alice",
  version: 2,
  generatedBy: "t",
  choicePoints: [
    {
      id: "cp01",
      chapter: 1,
      anchorAfter: "c001p003",
      rejoinAt: "c001p005",
      prompt: "What next?",
      isIntro: true,
      availableCharacters: [],
      plotOptions: [opt("p1"), opt("p2", "Everyone is safe and nobody is hurt."), opt("p3")],
      characterOptions: {},
    },
  ],
};

describe("content review", () => {
  it("builds entries with sources, flags and preserved decisions", () => {
    const cached = new Map([
      [reviewKey(2, "cp01", "p1", "narrator"), { segments: ["Generated."], source: "prewarm" }],
    ]);
    const approved = { [reviewKey(2, "cp01", "p3", "narrator")]: { segments: ["Hand edited."] } };
    const previous = [
      { key: reviewKey(2, "cp01", "p1", "narrator"), decision: "reject", notes: "too scary" },
    ] as never;
    const entries = buildReviewEntries(map, cached, approved, previous);

    expect(entries.map((e) => [e.source, e.decision])).toEqual([
      ["prewarm", "reject"],
      ["missing", "pending"],
      ["approved", "approve"],
    ]);
    expect(entries[0].notes).toBe("too scary");
    expect(entries[1].flags.join(" ")).toMatch(/fate/);
    expect(entries[2].text).toBe("Hand edited.");
  });

  it("applies decisions, rejecting empty or unsafe approvals", () => {
    const base = buildReviewEntries(map, new Map(), {});
    const entries = [
      { ...base[0], decision: "approve" as const, text: "A calm walk.\n\nThen home." },
      { ...base[1], decision: "approve" as const, text: "" },
      { ...base[2], decision: "reject" as const },
    ];
    const r = applyReview(entries, splitSegments);
    expect(Object.keys(r.approved)).toEqual([reviewKey(2, "cp01", "p1", "narrator")]);
    expect(r.approved[reviewKey(2, "cp01", "p1", "narrator")].segments.join("\n\n")).toBe(
      "A calm walk.\n\nThen home.",
    );
    expect(r.rejected).toEqual([reviewKey(2, "cp01", "p3", "narrator")]);
    expect(r.problems[0]).toMatch(/no text/);
    const unsafe = applyReview(
      [{ ...base[0], decision: "approve" as const, text: "What the hell, damn it." }],
      splitSegments,
    );
    expect(unsafe.problems[0]).toMatch(/blocklisted/);
  });
});
