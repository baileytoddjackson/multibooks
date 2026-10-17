import { describe, expect, it } from "vitest";
import {
  appendSegment,
  canUndo,
  createStory,
  mustOfferChoices,
  renameStory,
  turn,
  undoLastChoice,
  wrapUpState,
} from "@/lib/cyo/story";

const opening = {
  title: "The Glass Lighthouse",
  story: "It began on a windy night.",
  summary: "Mia finds a key.",
  cast: [
    { name: "Mia Torres", oneLine: "A brave kid" },
    { name: "Mia Torres", oneLine: "Duplicate name" },
  ],
  choices: ["Climb the stairs", "Knock on the door"],
};
const cont = (summary: string, choices: string[] = [], isEnding = false) => ({
  story: `Part: ${summary}`,
  summary,
  choices,
  isEnding,
});

describe("Create Your Own story state", () => {
  it("creates a story with unique cast ids and the opening as turn 1", () => {
    const s = createStory("s1", { genre: "mystery", setting: "A glass lighthouse" }, opening, 1);
    expect(turn(s)).toBe(1);
    expect(s.cast.map((c) => c.id)).toEqual(["mia-torres", "mia-torres-2"]);
    expect(s.segments[0].choices).toHaveLength(2);
  });

  it("requires choices at least every 3 segments", () => {
    let s = createStory("s1", { genre: "mystery", setting: "x" }, opening);
    s = appendSegment(s, "Climb the stairs", cont("A", []));
    expect(mustOfferChoices(s)).toBe(false); // one "Keep reading" segment allowed
    s = appendSegment(s, undefined, cont("B", []));
    expect(mustOfferChoices(s)).toBe(true);
    s = appendSegment(s, undefined, cont("C", ["Run", "Hide"]));
    s = appendSegment(s, "Run", cont("D", ["Left", "Right"]));
    expect(mustOfferChoices(s)).toBe(false);
  });

  it("undo goes back past 'Keep reading' segments to the last choice", () => {
    let s = createStory("s1", { genre: "mystery", setting: "x" }, opening);
    expect(canUndo(s)).toBe(false);
    s = appendSegment(s, "Climb the stairs", cont("A", []));
    s = appendSegment(s, undefined, cont("B", ["Run", "Hide"]));
    const back = undoLastChoice(s);
    expect(back.segments).toHaveLength(1);
    expect(back.segments[0].choices).toEqual(opening.choices);
    expect(undoLastChoice(back)).toBe(back);
  });

  it("an ending finishes the story and can be undone", () => {
    let s = createStory("s1", { genre: "humor", setting: "x" }, opening);
    s = appendSegment(s, "Climb the stairs", cont("The end.", ["ignored"], true));
    expect(s.status).toBe("done");
    expect(s.segments[1].choices).toEqual([]);
    expect(undoLastChoice(s).status).toBe("active");
  });

  it("offers an ending at the soft cap and forces one before the hard cap", () => {
    let s = createStory("s1", { genre: "humor", setting: "x" }, opening);
    for (let i = 0; i < 18; i++) s = appendSegment(s, `c${i}`, cont(`${i}`, ["a", "b"]));
    expect(turn(s)).toBe(19);
    expect(wrapUpState(s, 20, 25)).toBe("none");
    s = appendSegment(s, "x", cont("x", ["a", "b"]));
    expect(wrapUpState(s, 20, 25)).toBe("offer");
    while (turn(s) < 24) s = appendSegment(s, "x", cont("x", ["a", "b"]));
    expect(wrapUpState(s, 20, 25)).toBe("forced");
  });

  it("renames, trimming and ignoring empty titles", () => {
    const s = createStory("s1", { genre: "humor", setting: "x" }, opening);
    expect(renameStory(s, "  My Story  ").title).toBe("My Story");
    expect(renameStory(s, "   ").title).toBe("The Glass Lighthouse");
  });
});
