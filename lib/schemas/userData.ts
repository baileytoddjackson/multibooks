import { z } from "zod";
import type { AdventureState } from "@/lib/engine/bookAdventure";
import type { BookProgress, CyoStory } from "@/lib/client-store/types";
import { BookIdSchema } from "./content";

/**
 * Server-side validation for what readers save (see lib/client-store/types.ts). Everything here
 * was written by the app, but it arrives from the browser, so shapes and sizes are checked.
 */

const Id = z.string().regex(/^[a-z0-9-]{1,60}$/);
const Text = (max: number) => z.string().max(max);
const Time = z.number().int().nonnegative();
const Style = z.enum(["direct", "character", "both"]);

const ResolutionSchema = z.discriminatedUnion("kind", [
  z.object({
    cpId: z.string().regex(/^cp\d{2}$/),
    kind: z.literal("detour"),
    optionId: Id,
    optionLabel: Text(200),
    perspective: Id,
    segments: z.array(Text(6000)).max(4),
    narratorFallbackNote: Text(300).optional(),
  }),
  z.object({ cpId: z.string().regex(/^cp\d{2}$/), kind: z.literal("original") }),
]);

export const AdventureStateSchema: z.ZodType<AdventureState> = z.object({
  style: Style.optional(),
  characterId: Id.optional(),
  history: z.array(ResolutionSchema).max(200),
});

export const BookProgressSchema: z.ZodType<BookProgress> = z.object({
  bookId: BookIdSchema,
  mode: z.enum(["canon", "adventure"]),
  position: z.string().regex(/^c\d{3}p\d{3}$/),
  fraction: z.number().min(0).max(1),
  adventure: AdventureStateSchema.optional(),
  wordsRead: z.number().int().nonnegative(),
  updatedAt: Time,
});

export const CyoStorySchema: z.ZodType<CyoStory> = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  title: Text(120),
  genre: Id,
  setting: Text(400),
  details: Text(400).optional(),
  segments: z
    .array(
      z.object({
        text: Text(8000),
        choiceMade: Text(200).optional(),
        summary: Text(3000),
        choices: z.array(Text(200)).max(4),
        isEnding: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
  cast: z.array(z.object({ id: Id, name: Text(80), oneLine: Text(200) })).max(12),
  style: Style.optional(),
  characterId: Id.optional(),
  status: z.enum(["active", "done"]),
  createdAt: Time,
  updatedAt: Time,
});

/** Largest saved record accepted, in bytes of JSON (a long story is ~100 KB). */
export const MAX_SAVED_BYTES = 512_000;
