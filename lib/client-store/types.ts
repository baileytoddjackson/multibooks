import type { AdventureState } from "@/lib/engine/bookAdventure";
import type { BookId } from "@/lib/schemas/content";

/** Paragraph ids look like "c03p017" (chapter 3, paragraph 17). */
export type ParagraphId = string;

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

/** Adventure progress for a book (choices made, style, character). See lib/engine/bookAdventure.ts. */
export type { AdventureState } from "@/lib/engine/bookAdventure";

export interface BookProgress {
  bookId: BookId;
  mode: ReadingMode;
  position: ParagraphId;
  /** 0..1 through the canon text, for the progress bar and "Continue reading". */
  fraction: number;
  adventure?: AdventureState;
  wordsRead: number;
  updatedAt: number;
}

export interface CyoSegment {
  text: string;
  /** Label of the choice that led to this segment, if any. */
  choiceMade?: string;
  /** Running summary after this segment (kept per segment so undo restores it exactly). */
  summary: string;
  /** Choices offered after this segment (empty = "Keep reading" or the end). */
  choices: string[];
  isEnding?: boolean;
}

export interface CyoCastMember {
  id: string;
  name: string;
  oneLine: string;
}

export interface CyoStory {
  id: string;
  title: string;
  genre: string;
  setting: string;
  details?: string;
  segments: CyoSegment[];
  cast: CyoCastMember[];
  style?: InteractionStyle;
  characterId?: string;
  status: "active" | "done";
  createdAt: number;
  updatedAt: number;
}

export type FontSize = "s" | "m" | "l";
export type ReaderTheme = "light" | "sepia" | "dark";

export interface ReaderPrefs {
  fontSize: FontSize;
  theme: ReaderTheme;
}
