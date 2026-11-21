import type { AdventureMap, AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import type { Chapter, Paragraph } from "@/lib/schemas/content";
import type { InteractionStyle } from "@/lib/client-store/types";

/**
 * Where Adventure Mode leaves the book (pure, no I/O).
 *
 * The reader reads the book's real opening until its one choice point (the "entry"). Choosing an
 * option there starts an Adventure Mode story (lib/client-store/types.ts → AdventureStory), which
 * never returns to the original text. Reading as written never shows the choice.
 */

/**
 * The book's entry choice point: the intro one, or the first if none is marked. A placeholder map
 * (written without an API key) has no entry: its choices aren't fit to show readers.
 */
export function entryChoicePoint(map: AdventureMap | undefined): ChoicePoint | undefined {
  if (!map || map.generatedBy === "placeholder") return undefined;
  return map.choicePoints.find((cp) => cp.isIntro) ?? map.choicePoints[0];
}

/**
 * Whether Adventure Mode is ready for a book: a real entry choice, and real summaries (the
 * adventure's premise and storyline come from them). Placeholders mean "not yet".
 */
export function adventureAvailable(
  map: AdventureMap | undefined,
  summaries: { chapters: { generatedBy: string }[] } | undefined,
): boolean {
  return (
    !!entryChoicePoint(map) &&
    !!summaries?.chapters.length &&
    summaries.chapters.every((c) => c.generatedBy !== "placeholder")
  );
}

export interface ChoiceView {
  options: AdventureOption[];
  /** "narrator" or the character id the adventure is told from. */
  perspective: string;
  /** Set when the reader's character isn't in this scene. */
  narratorFallbackNote?: string;
}

/**
 * Options and perspective for a choice point given the reader's style:
 * - direct:    plot options, narrator
 * - character: the character's own options, their perspective
 * - both:      two of the character's options + one plot option, their perspective
 * A character who isn't in this scene falls back to the narrator with plot options.
 */
export function choiceView(
  cp: ChoicePoint,
  style: InteractionStyle | undefined,
  characterId: string | undefined,
  characterName?: string,
): ChoiceView {
  if (!style || style === "direct" || !characterId) {
    return { options: cp.plotOptions, perspective: "narrator" };
  }
  const own = cp.characterOptions[characterId];
  if (!own || !cp.availableCharacters.includes(characterId)) {
    return {
      options: cp.plotOptions,
      perspective: "narrator",
      narratorFallbackNote: `${characterName ?? "Your character"} isn't in this part of the story, so the narrator tells it.`,
    };
  }
  if (style === "character") return { options: own, perspective: characterId };
  return { options: [...own.slice(0, 2), cp.plotOptions[0]], perspective: characterId };
}

export type PageBlock =
  { type: "canon"; paragraphs: Paragraph[] } | { type: "choice"; cp: ChoicePoint };

/**
 * One page of the entry chapter in Adventure Mode: the original text up to the entry choice,
 * then the choice. Nothing after the choice shows: the reader's adventure takes over from there.
 * Returns `blocked: true` when the choice is on (or before) this page.
 */
export function layoutEntryPage(
  chapter: Pick<Chapter, "index" | "paragraphs">,
  range: { start: number; end: number },
  entry: ChoicePoint | undefined,
): { blocks: PageBlock[]; blocked: boolean } {
  const anchor =
    entry && entry.chapter === chapter.index
      ? chapter.paragraphs.findIndex((p) => p.id === entry.anchorAfter)
      : -1;
  if (!entry || anchor < 0 || anchor >= range.end) {
    return {
      blocks: [{ type: "canon", paragraphs: chapter.paragraphs.slice(range.start, range.end) }],
      blocked: false,
    };
  }
  // A choice on an earlier page blocks everything after it.
  if (anchor < range.start) return { blocks: [{ type: "choice", cp: entry }], blocked: true };
  return {
    blocks: [
      { type: "canon", paragraphs: chapter.paragraphs.slice(range.start, anchor + 1) },
      { type: "choice", cp: entry },
    ],
    blocked: true,
  };
}
