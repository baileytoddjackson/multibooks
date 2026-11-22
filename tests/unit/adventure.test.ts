import { describe, expect, it } from "vitest";
import { beatIndexFor, buildOutline, MAX_BEATS } from "@/lib/adventure/outline";
import type { AdventureStory } from "@/lib/client-store/types";
import { appendSegment, canUndo, undoLastChoice, wrapUpState } from "@/lib/cyo/story";
import {
  buildAdventureContinuationPrompt,
  buildAdventureOpeningPrompt,
  textBeforeChoice,
} from "@/lib/prompts/adventure";
import type { ChoicePoint } from "@/lib/schemas/adventure";
import type { BookMeta, ChapterSummary, Character } from "@/lib/schemas/content";
import { AdventureStorySchema } from "@/lib/schemas/userData";

const summary = (index: number, kind: ChapterSummary["kind"] = "narrative"): ChapterSummary => ({
  index,
  summary: `Chapter ${index} summary.`,
  keyEvents: [`event ${index}a`, `event ${index}b`],
  charactersPresent: [],
  setting: "Somewhere",
  kind,
  contentNotes: [],
  generatedBy: "test",
});

describe("book outline", () => {
  it("groups the book from the branch on into at most a dozen beats", () => {
    const chapters = Array.from({ length: 136 }, (_, i) =>
      summary(i + 1, i % 3 ? "narrative" : "essay"),
    );
    const beats = buildOutline({ chapters }, 1);
    expect(beats).toHaveLength(MAX_BEATS);
    // The reader left chapter 1 part way through, so its later events are still ahead.
    expect(beats[0].chapters[0]).toBe(1);
    expect(beats[beats.length - 1].chapters[1]).toBe(136);
    // Contiguous, no gaps.
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i].chapters[0]).toBe(beats[i - 1].chapters[1] + 1);
    }
    for (const b of beats) expect(b.events.split(/\s+/).length).toBeLessThanOrEqual(61);
  });

  it("prefers story chapters over essay chapters", () => {
    const beats = buildOutline(
      { chapters: [summary(1, "essay"), summary(2, "essay"), summary(3)] },
      1,
      1,
    );
    expect(beats[0].events).toContain("event 3a");
    expect(beats[0].events).not.toContain("event 2a");
  });

  it("uses one beat per chapter for short books", () => {
    const chapters = Array.from({ length: 5 }, (_, i) => summary(i + 1));
    expect(buildOutline({ chapters }, 2).map((b) => b.chapters)).toEqual([
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
  });

  it("paces the beats across the planned pages", () => {
    expect(beatIndexFor(1, 12, 24)).toBe(0);
    expect(beatIndexFor(3, 12, 24)).toBe(1);
    expect(beatIndexFor(24, 12, 24)).toBe(11);
    expect(beatIndexFor(40, 12, 24)).toBe(11); // past the plan: stays on the final beat
    expect(beatIndexFor(5, 0, 24)).toBe(0);
  });
});

const book = {
  id: "alice",
  title: "Alice's Adventures in Wonderland",
  shortTitle: "Alice in Wonderland",
  author: "Lewis Carroll",
} as BookMeta;
const cast = [
  {
    id: "alice",
    name: "Alice",
    oneLine: "A curious girl.",
    profile: "p",
    voiceNotes: "v",
    pov: "third",
  },
] as Character[];
const option = { id: "p1", label: "Climb the table", detourBrief: "She climbs.", mustPreserve: [] };
const cp = {
  id: "cp01",
  chapter: 1,
  anchorAfter: "c001p002",
  prompt: "What should Alice do?",
} as ChoicePoint;
const chapter = {
  bookId: "alice",
  index: 1,
  title: "Down the Rabbit-Hole",
  paragraphs: [
    { id: "c001p001", text: "First paragraph." },
    { id: "c001p002", text: "Right before the choice." },
    { id: "c001p003", text: "AFTER THE CHOICE, never shown." },
  ],
  pageStarts: [0],
  wordCount: 9,
} as const;

describe("adventure prompts", () => {
  it("opens from the original text before the choice, never after it", () => {
    expect(textBeforeChoice(chapter as never, "c001p002")).toBe(
      "First paragraph.\n\nRight before the choice.",
    );
    const p = buildAdventureOpeningPrompt({
      book,
      synopsis: "A girl falls into Wonderland.",
      cast,
      chapter: chapter as never,

      cp,
      option,
      firstBeat: { chapters: [2, 2], events: "the pool of tears" },
    });
    expect(p.kind).toBe("adventure_open");
    expect(p.user).toContain("Right before the choice.");
    expect(p.user).not.toContain("AFTER THE CHOICE");
    expect(p.user).toContain('They chose: "Climb the table"');
    expect(p.user).toContain("the pool of tears");
    // Nothing after the choice is presented as already read.
    expect(p.user).toContain("Nothing after the choice has happened yet");
    expect(p.user).toContain("none of it has\nhappened unless the adventure itself says so");
    expect(p.system).toContain("never goes back to the original text");
    expect(p.mock().choices.length).toBeGreaterThanOrEqual(2);
  });

  it("puts the adventure's own history first and the book's storyline as a loose guide", () => {
    const p = buildAdventureContinuationPrompt({
      book,
      synopsis: "A girl falls into Wonderland.",
      cast,
      summary: "Alice befriended a talking teapot.",
      facts: ["The teapot is called Mabel"],
      choicesSoFar: ["Climb the table", "Talk to the teapot"],
      recentPages: ["Page one.", "Page two."],
      choice: "Ask Mabel for directions",
      beat: { chapters: [7, 7], events: "a mad tea party" },
      isFinalBeat: false,
      mustOfferChoices: true,
      phase: "continue",
    });
    const u = p.user;
    expect(u.indexOf("<adventure_summary>")).toBeLessThan(u.indexOf("<book_storyline_around_now>"));
    expect(u).toContain("The teapot is called Mabel");
    expect(u).toContain("2. Talk to the teapot");
    expect(u).toContain("<reader_choice>Ask Mabel for directions</reader_choice>");
    expect(u).toContain("A loose guide only");
    expect(u).toContain("end it with 2-3 choices");
  });

  it("asks for an ending in the ending phase", () => {
    const p = buildAdventureContinuationPrompt({
      book,
      synopsis: "s",
      cast,
      summary: "s",
      facts: [],
      choicesSoFar: [],
      recentPages: ["p"],
      isFinalBeat: true,
      mustOfferChoices: false,
      phase: "ending",
    });
    expect(p.user).toContain("Write the ENDING");
    expect(p.mock().isEnding).toBe(true);
  });
});

describe("adventure story state", () => {
  const story: AdventureStory = {
    id: "0b6c1f7e-1111-2222-3333-444455556666",
    kind: "adventure",
    bookId: "alice",
    title: "Alice in Wonderland: my adventure",
    segments: [],
    cast: [{ id: "alice", name: "Alice", oneLine: "A curious girl." }],
    style: "direct",
    branch: {
      chapter: 1,
      cpId: "cp01",
      optionId: "p1",
      choice: "Climb the table",
      perspective: "narrator",
    },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };

  it("is saved before its first page arrives, and validates", () => {
    expect(AdventureStorySchema.safeParse(story).success).toBe(true);
    expect(canUndo(story)).toBe(false);
  });

  it("keeps facts per page, and undo never goes back past the first page", () => {
    const one = appendSegment(story, "Climb the table", {
      story: "Opening.",
      summary: "S1",
      facts: ["f1"],
      choices: ["A", "B"],
      isEnding: false,
    });
    const two = appendSegment(one, "A", {
      story: "Next.",
      summary: "S2",
      facts: ["f1", "f2"],
      choices: ["C", "D"],
      isEnding: false,
    });
    expect(two.segments.map((s) => s.facts)).toEqual([["f1"], ["f1", "f2"]]);
    const back = undoLastChoice(two);
    expect(back.segments).toHaveLength(1);
    expect(back.segments[0].summary).toBe("S1");
    expect(undoLastChoice(back).segments).toHaveLength(1);
    expect(AdventureStorySchema.safeParse(two).success).toBe(true);
  });

  it("offers and then forces the ending at the adventure caps", () => {
    const withPages = (n: number) => ({
      ...story,
      segments: Array.from({ length: n }, () => ({ text: "t", summary: "s", choices: [] })),
    });
    expect(wrapUpState(withPages(10), 24, 30)).toBe("none");
    expect(wrapUpState(withPages(24), 24, 30)).toBe("offer");
    expect(wrapUpState(withPages(29), 24, 30)).toBe("forced");
  });
});
