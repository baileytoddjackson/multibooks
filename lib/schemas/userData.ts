import { z } from "zod";
import type {
  AdventureStory,
  BookProgress,
  CyoStory,
  Story,
  StorySegment,
} from "@/lib/client-store/types";
import { BookIdSchema } from "./content";

/**
 * Server-side validation for what readers save (see lib/client-store/types.ts). Everything here
 * was written by the app, but it arrives from the browser, so shapes and sizes are checked.
 */

const Id = z.string().regex(/^[a-z0-9-]{1,60}$/);
export const StoryIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const Text = (max: number) => z.string().max(max);
const Time = z.number().int().nonnegative();
const Style = z.enum(["direct", "character", "both"]);

export const BookProgressSchema: z.ZodType<BookProgress> = z.object({
  bookId: BookIdSchema,
  position: z.string().regex(/^c\d{3}p\d{3}$/),
  fraction: z.number().min(0).max(1),
  wordsRead: z.number().int().nonnegative(),
  updatedAt: Time,
});

/** Most facts an adventure keeps at once (older ones drop off as new ones arrive). */
export const MAX_FACTS = 12;

const SegmentSchema: z.ZodType<StorySegment> = z.object({
  text: Text(8000),
  choiceMade: Text(200).optional(),
  summary: Text(3000),
  facts: z.array(Text(200)).max(MAX_FACTS).optional(),
  choices: z.array(Text(200)).max(4),
  isEnding: z.boolean().optional(),
});

const base = {
  id: StoryIdSchema,
  title: Text(120),
  segments: z.array(SegmentSchema).max(200),
  cast: z.array(z.object({ id: Id, name: Text(80), oneLine: Text(200) })).max(12),
  style: Style.optional(),
  characterId: Id.optional(),
  status: z.enum(["active", "done"]),
  createdAt: Time,
  updatedAt: Time,
};

export const CyoStorySchema: z.ZodType<CyoStory> = z.object({
  ...base,
  kind: z.literal("create").optional(),
  segments: base.segments.min(1),
  genre: Id,
  setting: Text(400),
  details: Text(400).optional(),
});

export const AdventureStorySchema: z.ZodType<AdventureStory> = z.object({
  ...base,
  // An adventure is saved as soon as the reader leaves the book, before its first page arrives.
  kind: z.literal("adventure"),
  bookId: BookIdSchema,
  branch: z.object({
    chapter: z.number().int().positive(),
    cpId: z.string().regex(/^cp\d{2}$/),
    optionId: Id,
    choice: Text(200),
    perspective: Id,
    lead: z
      .array(
        z.object({
          id: z.string().regex(/^c\d{3}p\d{3}$/),
          text: Text(6000),
          kind: z.enum(["verse", "break"]).optional(),
        }),
      )
      .max(80)
      .optional(),
  }),
});

export const StorySchema: z.ZodType<Story> = z.union([AdventureStorySchema, CyoStorySchema]);

/** Largest saved record accepted, in bytes of JSON (a long story is ~100 KB). */
export const MAX_SAVED_BYTES = 512_000;
