/**
 * Prompts for the one-time offline content scripts. Output is reviewed and committed, so these
 * favour accuracy over brevity. Runtime prompts live alongside in lib/prompts/*.ts.
 */
import type { Chapter } from "@/lib/schemas/content";

export const SUMMARY_SYSTEM = `You write chapter notes for a reading app used by students aged 11-14.
The notes are used behind the scenes to keep generated "choose your own adventure" detours faithful
to the original book, and are also shown to teachers.

Rules:
- Be accurate to the text. Never invent events. If something is ambiguous, leave it out.
- Summary: at most 90 words, past tense, plain grade-7 vocabulary, names exactly as the text uses them.
- keyEvents: 1-5 short phrases in the order they happen.
- charactersPresent: named characters who appear or speak in this chapter (not ones only mentioned).
- kind: "essay" when the chapter is mostly description, explanation or reflection with no plot
  (common in Moby-Dick), "mixed" when it is both, otherwise "narrative".
- contentNotes: brief, factual flags a teacher might want (e.g. "a sailor dies", "drinking"),
  or an empty list.
Return only the JSON object.`;

export function summaryUser(bookTitle: string, chapter: Chapter): string {
  const heading = [chapter.title, chapter.subtitle].filter(Boolean).join(": ");
  const text = chapter.paragraphs
    .filter((p) => p.kind !== "break")
    .map((p) => p.text)
    .join("\n\n");
  return `Book: ${bookTitle}\nChapter ${chapter.index}: ${heading}\n\n<chapter_text>\n${text}\n</chapter_text>`;
}

export const SYNOPSIS_SYSTEM = `You write a short synopsis of a whole book for a reading app used by students
aged 11-14, using only the chapter notes provided. At most 150 words, plain language, no spoilers
softened or changed: describe what really happens. Also list 2-6 major story arcs as short phrases.
Return only the JSON object.`;

export function synopsisUser(
  bookTitle: string,
  notes: { index: number; summary: string }[],
): string {
  return `Book: ${bookTitle}\n\n${notes.map((n) => `Chapter ${n.index}: ${n.summary}`).join("\n")}`;
}

/* ── Adventure maps ──────────────────────────────────────────────────────────────────────── */

export const ADVENTURE_MAP_SYSTEM = `You design one choice point for a "choose your own adventure" layer on top of
a classic book, for readers aged 11-14. The reader reads the ORIGINAL text, reaches your choice,
reads a short generated detour (150-250 words), and then the ORIGINAL text resumes. The detour is a
brief side-path: it can show a consequence, a different angle, or a small moment the author skipped,
but it must NOT change the plot, any character's fate, or the ending. The original must be able to
pick up again at the rejoin paragraph as if nothing contradicted it.

Pick the moment:
- anchorAfter: a paragraph id at a natural pause where a reader would enjoy making a choice
  (a decision, a strange sight, a moment of suspense). Not in the middle of a quoted conversation.
- rejoinAt: the paragraph id where the original resumes, 1-6 paragraphs after anchorAfter. The
  paragraphs in between are replaced by the detour, so the detour must cover what they cover.
  Choose a rejoin paragraph that reads naturally after a detour (e.g. starts a new beat).

Write the choice:
- prompt: an in-story question in plain words, at most 25 words, e.g. "The little door is locked.
  What should Alice try?"
- plotOptions: exactly 3 options for "direct the story", told by the narrator. Each one clearly
  different. Labels start with a verb, at most 12 words, no spoilers.
- characterOptions: for each listed character who is actually present in this scene, exactly 2
  options written as what THAT character might do or notice. Only use the character ids given.
- detourBrief for every option: at most 60 words describing what happens, and how it ends so the
  original text can resume at rejoinAt.
- mustPreserve: 1-3 facts from the original the detour must not change.

Safety for this age group:
- No graphic violence, gore, cruelty, romance beyond the original, or scary content beyond the
  book's own level. Classic danger (storms, monsters, whale hunts) is fine if told without gore.
- Options must be kind or curious or brave; never cruel, never self-harm, never "kill" someone.
- Respectful portrayal of every culture and character.
Return only the JSON object.`;

export function adventureMapUser(args: {
  bookTitle: string;
  chapter: Chapter;
  chapterSummary: string;
  cast: { id: string; name: string; oneLine: string }[];
  isIntro: boolean;
  minIntroWords: number;
}): string {
  const { bookTitle, chapter, chapterSummary, cast, isIntro, minIntroWords } = args;
  const heading = [chapter.title, chapter.subtitle].filter(Boolean).join(": ");
  const text = chapter.paragraphs
    .map((p) => (p.kind === "break" ? `[${p.id}] * * *` : `[${p.id}] ${p.text}`))
    .join("\n\n");
  const castList = cast.length
    ? cast.map((c) => `- ${c.id}: ${c.name} (${c.oneLine})`).join("\n")
    : "(none yet: return an empty characterOptions list)";
  const intro = isIntro
    ? `\nThis is the FIRST choice in the book. Place it after at least ${minIntroWords} words of the original, near the end of the chapter if possible, so the reader has settled into the story first.\n`
    : "";
  return `Book: ${bookTitle}
Chapter ${chapter.index}: ${heading}
Summary: ${chapterSummary}
${intro}
Characters the reader may play (use these ids only, and only if present in this scene):
${castList}

<chapter_text>
${text}
</chapter_text>`;
}
