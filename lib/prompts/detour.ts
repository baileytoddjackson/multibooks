import { z } from "zod";
import { smartQuotes } from "@/lib/text/smartQuotes";
import type { AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import type { BookMeta, Chapter, Character } from "@/lib/schemas/content";
import { perspectiveInstructions } from "./characterPerspective";
import { AUDIENCE_AND_SAFETY, READING_LEVEL } from "./shared";

/**
 * Canon-anchored detour generation.
 *
 * The model gets only what it needs to stay faithful: the chapter summary, a little original text
 * before the choice, the original paragraphs the detour replaces, the opening of the paragraph where
 * the original resumes, the option's brief, and (optionally) a character profile. Never the whole book.
 *
 * Output is a single `story` string so it can be streamed to the reader as it's written.
 */

export const DetourOutputSchema = z.object({
  story: z
    .string()
    .describe("The detour, 150-250 words, in short paragraphs separated by blank lines."),
});
export type DetourOutput = z.infer<typeof DetourOutputSchema>;

export const DETOUR_MAX_TOKENS = 1500;

const SYSTEM = `${AUDIENCE_AND_SAFETY}

${READING_LEVEL}

Your job: write a short "choose your own adventure" detour inside a classic book. The reader has been
reading the ORIGINAL text, made a choice, and now reads your detour. Right after it, the ORIGINAL text
resumes at a fixed paragraph. So the detour must:
1. Follow the chosen option's brief, starting right where the original left off.
2. Keep the author's voice and flavour (setting, tone, how characters talk), but at the reading
   level above. Simplify old-fashioned language rather than copying it.
3. Cover what the replaced original paragraphs cover, so nothing important is lost.
4. Never change the plot, any character's fate, or facts listed under "must not change".
5. End so the resuming original paragraph follows naturally: no cliffhanger that the original
   ignores, no new characters or objects the original would contradict.
6. Be 150-250 words. Do not start with the option label or a summary of the choice.

Return only the JSON object.`;

/** Last ~`maxWords` words of the original text up to and including the anchor paragraph. */
function textBefore(chapter: Chapter, anchorIdx: number, maxWords: number): string {
  const out: string[] = [];
  let words = 0;
  for (let i = anchorIdx; i >= 0 && words < maxWords; i--) {
    const p = chapter.paragraphs[i];
    if (p.kind === "break") continue;
    out.unshift(p.text);
    words += p.text.split(/\s+/).length;
  }
  return out.join("\n\n");
}

function firstWords(text: string, n: number) {
  const w = text.split(/\s+/);
  return w.length <= n ? text : w.slice(0, n).join(" ") + " …";
}

export interface DetourPromptInput {
  book: BookMeta;
  chapter: Chapter;
  chapterSummary: string;
  previousSummary?: string;
  cp: ChoicePoint;
  option: AdventureOption;
  character?: Character;
}

export function buildDetourPrompt(input: DetourPromptInput) {
  const { book, chapter, chapterSummary, previousSummary, cp, option, character } = input;
  const a = chapter.paragraphs.findIndex((p) => p.id === cp.anchorAfter);
  const r = chapter.paragraphs.findIndex((p) => p.id === cp.rejoinAt);
  const replaced = chapter.paragraphs
    .slice(a + 1, r)
    .filter((p) => p.kind !== "break")
    .map((p) => p.text)
    .join("\n\n");

  const user = `Book: ${book.title} by ${book.author}${book.translator ? ` (translated by ${book.translator})` : ""}
${previousSummary ? `Previous chapter: ${previousSummary}\n` : ""}This chapter: ${chapterSummary}

${perspectiveInstructions(character)}

<original_before_choice>
${textBefore(chapter, a, 160)}
</original_before_choice>

The reader was asked: "${cp.prompt}"
They chose: "${option.label}"
What happens in the detour: ${option.detourBrief}
Must not change: ${option.mustPreserve.length ? option.mustPreserve.join("; ") : "the plot and every character's fate"}

<original_paragraphs_replaced_by_detour>
${replaced || "(none)"}
</original_paragraphs_replaced_by_detour>

<original_resumes_with>
${firstWords(chapter.paragraphs[r]?.text ?? "", 90)}
</original_resumes_with>`;

  return {
    kind: "detour" as const,
    system: SYSTEM,
    user,
    schema: DetourOutputSchema,
    maxTokens: DETOUR_MAX_TOKENS,
    streamField: "story",
    mock: (): DetourOutput => ({
      story: [
        `This is a pretend adventure passage for "${option.label}". In the real app, a few short paragraphs appear here, written in the style of ${book.author}.`,
        `${character ? `${character.name} looks around carefully.` : "The story takes a small detour."} Something curious happens, and then things settle down again.`,
        "Soon everything is ready for the original story to carry on.",
      ].join("\n\n"),
    }),
  };
}

/** Splits a detour into 1-2 reader segments at a paragraph boundary. */
export function splitSegments(story: string): string[] {
  const paras = smartQuotes(story)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const words = paras.reduce((n, p) => n + p.split(/\s+/).length, 0);
  if (paras.length < 2 || words < 200) return [paras.join("\n\n")];
  let acc = 0;
  for (let i = 0; i < paras.length; i++) {
    acc += paras[i].split(/\s+/).length;
    if (acc >= words / 2) {
      return [paras.slice(0, i + 1).join("\n\n"), paras.slice(i + 1).join("\n\n")].filter(Boolean);
    }
  }
  return [paras.join("\n\n")];
}

export { smartQuotes };
