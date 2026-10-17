import { z } from "zod";

/** Static, committed book content. Every JSON file under content/books is validated against these. */

export const BookIdSchema = z.enum(["alice", "odyssey", "moby-dick"]);
export type BookId = z.infer<typeof BookIdSchema>;

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const BookMetaSchema = z.object({
  id: BookIdSchema,
  title: z.string(),
  shortTitle: z.string(),
  author: z.string(),
  translator: z.string().optional(),
  gutenbergId: z.number().int(),
  hook: z.string().max(100),
  difficulty: z.enum(["easy", "medium", "hard"]),
  length: z.enum(["short", "medium", "long"]),
  /** Estimated reading time for the full canon text at ~150 wpm. */
  estMinutes: z.number().int().positive(),
  cover: z.object({
    from: HexColor,
    to: HexColor,
    motif: z.enum(["watch", "sail", "whale"]),
  }),
});
export type BookMeta = z.infer<typeof BookMetaSchema>;

/* ── Chapters & table of contents (written by scripts/clean-and-chunk.ts) ─────────────────── */

export const ParagraphSchema = z.object({
  id: z.string().regex(/^c\d{3}p\d{3}$/),
  text: z.string(),
  kind: z.enum(["verse", "break"]).optional(),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

export const ChapterSchema = z.object({
  bookId: BookIdSchema,
  index: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string().optional(),
  paragraphs: z.array(ParagraphSchema).min(1),
  pageStarts: z.array(z.number().int().nonnegative()).min(1),
  wordCount: z.number().int().nonnegative(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const TocSchema = z.object({
  bookId: BookIdSchema,
  totalWords: z.number().int().positive(),
  chapters: z.array(
    z.object({
      index: z.number().int().positive(),
      title: z.string(),
      subtitle: z.string().optional(),
      wordCount: z.number().int().nonnegative(),
      pages: z.number().int().positive(),
      wordsBefore: z.number().int().nonnegative(),
    }),
  ),
});
export type Toc = z.infer<typeof TocSchema>;

/* ── Summaries (scripts/gen-summaries.ts) ─────────────────────────────────────────────────── */

/** What the model returns for one chapter. */
export const ChapterSummaryOutputSchema = z.object({
  summary: z.string().describe("At most 90 words, plain grade-7 language, past tense."),
  // No .max(): the API can't enforce array lengths, so gen-summaries trims to 5 instead of failing.
  keyEvents: z.array(z.string()).min(1).describe("1-5 short phrases, in order."),
  charactersPresent: z
    .array(z.string())
    .describe("Named characters who appear or speak, using the names in the text."),
  setting: z.string().describe("Where this chapter takes place, a few words."),
  kind: z
    .enum(["narrative", "essay", "mixed"])
    .describe("'essay' for chapters that are mostly description/explanation with no plot."),
  contentNotes: z
    .array(z.string())
    .describe("Anything a middle-school teacher might want flagged (violence, death, etc.)."),
});
export type ChapterSummaryOutput = z.infer<typeof ChapterSummaryOutputSchema>;

export const ChapterSummarySchema = ChapterSummaryOutputSchema.extend({
  index: z.number().int().positive(),
  /** "placeholder" entries are mechanical stand-ins created without an API key. */
  generatedBy: z.string(),
});
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;

export const BookSynopsisOutputSchema = z.object({
  synopsis: z.string().describe("At most 150 words."),
  majorArcs: z.array(z.string()).min(1).describe("2-6 short phrases."),
});

export const SummariesSchema = z.object({
  bookId: BookIdSchema,
  chapters: z.array(ChapterSummarySchema),
  synopsis: z.string(),
  majorArcs: z.array(z.string()),
});
export type Summaries = z.infer<typeof SummariesSchema>;

/* ── Characters (curated cast; content/books/<id>/characters.json) ───────────────────────── */

export const CharacterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** Other names readers may know, e.g. Ulysses → "Odysseus". */
  alsoKnownAs: z.array(z.string()).default([]),
  oneLine: z.string().max(90),
  profile: z.string(),
  voiceNotes: z.string(),
  /** Chapter where this character first appears on the page. Not selectable before this. */
  firstAppearsChapter: z.number().int().positive(),
  /** First person only for the book's own narrator; everyone else is close third person. */
  pov: z.enum(["first", "third"]),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CharactersSchema = z.object({
  bookId: BookIdSchema,
  characters: z.array(CharacterSchema).min(1).max(6),
});
export type Characters = z.infer<typeof CharactersSchema>;
