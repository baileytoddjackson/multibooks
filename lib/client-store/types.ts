import type { BookId, Paragraph } from "@/lib/schemas/content";

/** Paragraph ids look like "c003p017" (chapter 3, paragraph 17). */
export type ParagraphId = string;

/** "canon" = read it as written; "adventure" = a generated story that grows out of the book. */
export type ReadingMode = "canon" | "adventure";
export type InteractionStyle = "direct" | "character" | "both";
/** "narrator" or a character id from the book's curated cast. */
export type Perspective = string;

export interface Session {
  anonId: string;
  /** Optional group tag typed in by a facilitator, e.g. "LIB-OCT20". Never a name. */
  sessionCode?: string;
  createdAt: number;
}

/** Where a reader is in a book they're reading as written. */
export interface BookProgress {
  bookId: BookId;
  position: ParagraphId;
  /** 0..1 through the canon text, for the progress bar and "Continue reading". */
  fraction: number;
  wordsRead: number;
  updatedAt: number;
}

export interface StorySegment {
  text: string;
  /** Label of the choice that led to this segment, if any. */
  choiceMade?: string;
  /** Running summary after this segment (kept per segment so undo restores it exactly). */
  summary: string;
  /**
   * Adventure Mode only: short facts the story has established so far (who's who, what was
   * found, promises made), kept so later pages stay consistent with them.
   */
  facts?: string[];
  /** Choices offered after this segment (empty = "Keep reading" or the end). */
  choices: string[];
  isEnding?: boolean;
}

export interface CastMember {
  id: string;
  name: string;
  oneLine: string;
}

interface StoryBase {
  id: string;
  title: string;
  segments: StorySegment[];
  /** Characters the reader can play as. */
  cast: CastMember[];
  style?: InteractionStyle;
  characterId?: string;
  status: "active" | "done";
  createdAt: number;
  updatedAt: number;
}

/** A Create Your Own story (genre → setting → details). */
export interface CyoStory extends StoryBase {
  kind?: "create";
  genre: string;
  setting: string;
  details?: string;
}

/** Where an adventure left the book: the reader's first choice. */
export interface AdventureBranch {
  chapter: number;
  cpId: string;
  optionId: string;
  /** The option's label, as the reader saw it. */
  choice: string;
  /** "narrator" or the character id the story follows. */
  perspective: string;
  /**
   * The original text of the page the reader was on, up to the choice. The adventure page shows
   * it first, so the story reads on unchanged up to the decision.
   */
  lead?: Paragraph[];
}

/**
 * An Adventure Mode story: it starts from a book's real opening, then becomes a new story that
 * loosely follows the book's storyline. One-way: it never returns to the original text.
 */
export interface AdventureStory extends StoryBase {
  kind: "adventure";
  bookId: BookId;
  branch: AdventureBranch;
}

export type Story = CyoStory | AdventureStory;

export function isAdventure(s: Story): s is AdventureStory {
  return s.kind === "adventure";
}

/** Older names, still used by Create Your Own code. */
export type CyoSegment = StorySegment;
export type CyoCastMember = CastMember;

export type FontSize = "s" | "m" | "l";
export type ReaderTheme = "light" | "sepia" | "dark";

export interface ReaderPrefs {
  fontSize: FontSize;
  theme: ReaderTheme;
}
