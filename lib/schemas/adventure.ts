import { z } from "zod";
import { BookIdSchema } from "./content";

/**
 * Adventure maps (content/books/<id>/adventure-map.json) define where choices appear in a book
 * and how each option's short detour rejoins the original text. Generated once offline by
 * scripts/gen-adventure-map.ts, validated, reviewed and committed.
 */

const ParagraphIdSchema = z.string().regex(/^c\d{3}p\d{3}$/);

export const OptionSchema = z.object({
  /** "p1".."p3" for plot options, "<characterId>-1".. for character options. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Shown on the choice button. Short, active, kid-friendly. */
  label: z.string().min(3).max(90),
  /** What happens in the detour (instructions for the writer prompt, never shown). */
  detourBrief: z.string().min(10).max(500),
  /** Canon facts the detour must not contradict. */
  mustPreserve: z.array(z.string()).default([]),
});
export type AdventureOption = z.infer<typeof OptionSchema>;

export const ChoicePointSchema = z.object({
  id: z.string().regex(/^cp\d{2}$/),
  chapter: z.number().int().positive(),
  /** The choice appears right after this canon paragraph. */
  anchorAfter: ParagraphIdSchema,
  /** After the detour, the original text resumes at this paragraph. */
  rejoinAt: ParagraphIdSchema,
  /** In-story question, e.g. "Alice sees a little door. What should she do?" */
  prompt: z.string().min(5).max(200),
  /** The first choice point also introduces the interaction-style selector. */
  isIntro: z.boolean(),
  /** Curated characters present in this scene (others fall back to the narrator). */
  availableCharacters: z.array(z.string()),
  /** "Direct the story" options, told by the narrator. */
  plotOptions: z.array(OptionSchema).min(2).max(3),
  /** "Be a character" options per available character, told from their perspective. */
  characterOptions: z.record(z.string(), z.array(OptionSchema).min(2).max(3)),
});
export type ChoicePoint = z.infer<typeof ChoicePointSchema>;

export const AdventureMapSchema = z.object({
  bookId: BookIdSchema,
  /** Bump when choice points change; part of the detour cache key. */
  version: z.number().int().positive(),
  generatedBy: z.string(),
  choicePoints: z.array(ChoicePointSchema).min(1),
});
export type AdventureMap = z.infer<typeof AdventureMapSchema>;

/* ── What the model returns for one chapter (scripts/gen-adventure-map.ts) ──────────────── */

const ModelOptionSchema = z.object({
  label: z.string().describe("Choice button text, at most 12 words, starts with a verb."),
  detourBrief: z
    .string()
    .describe(
      "What happens in this short detour, at most 60 words. Must lead back to the rejoin point.",
    ),
  mustPreserve: z.array(z.string()).describe("1-3 canon facts the detour must not change."),
});

export const ChoicePointOutputSchema = z.object({
  anchorAfter: z.string().describe("Paragraph id after which the choice appears."),
  rejoinAt: z
    .string()
    .describe("Paragraph id where the original text resumes; 1-6 paragraphs after anchorAfter."),
  prompt: z.string().describe("The in-story question, at most 25 words."),
  availableCharacters: z
    .array(z.string())
    .describe("Ids of listed characters who are actually present in this scene."),
  plotOptions: z.array(ModelOptionSchema).describe("Exactly 3 options, told by the narrator."),
  characterOptions: z
    .array(
      z.object({
        characterId: z.string(),
        options: z
          .array(ModelOptionSchema)
          .describe("Exactly 2 options from this character's view."),
      }),
    )
    .describe("One entry per available character."),
});
export type ChoicePointOutput = z.infer<typeof ChoicePointOutputSchema>;
