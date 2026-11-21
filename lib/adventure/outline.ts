import type { Summaries } from "@/lib/schemas/content";

/**
 * The book's storyline as a loose outline for Adventure Mode.
 *
 * An adventure leaves the original text at its first choice, but it should still feel like the
 * book: the same world, the same characters, and roughly the same big story. So the chapters after
 * the branch are grouped into a dozen or so "beats" (a few key events each), and each new page is
 * told which beat the book would be at by now. The prompt treats it as a suggestion only: what
 * the reader has already chosen always wins.
 */
export interface Beat {
  /** First and last book chapters this beat covers. */
  chapters: [number, number];
  /** A few key events from those chapters, at most ~60 words. */
  events: string;
}

export const MAX_BEATS = 12;
const BEAT_WORDS = 60;

function clip(text: string, words: number): string {
  const w = text.split(/\s+/).filter(Boolean);
  return w.length <= words ? w.join(" ") : `${w.slice(0, words).join(" ")} …`;
}

/** Groups the chapters after `fromChapter` into at most `maxBeats` evenly sized beats. */
export function buildOutline(
  summaries: Pick<Summaries, "chapters">,
  fromChapter: number,
  maxBeats = MAX_BEATS,
): Beat[] {
  const later = summaries.chapters
    .filter((c) => c.index > fromChapter)
    .sort((a, b) => a.index - b.index);
  if (!later.length) return [];
  const n = Math.min(maxBeats, later.length);
  const beats: Beat[] = [];
  for (let i = 0; i < n; i++) {
    const group = later.slice(
      Math.floor((i * later.length) / n),
      Math.floor(((i + 1) * later.length) / n),
    );
    // Essay chapters (whale anatomy, history) carry little plot; prefer the story chapters.
    const story = group.filter((c) => c.kind !== "essay");
    const events = (story.length ? story : group).flatMap((c) =>
      c.keyEvents.slice(0, story.length > 3 ? 1 : 2),
    );
    beats.push({
      chapters: [group[0].index, group[group.length - 1].index],
      events: clip(events.join("; "), BEAT_WORDS),
    });
  }
  return beats;
}

/**
 * Which beat a page belongs to: the outline is spread evenly over `plannedPages` pages, so an
 * adventure reaches the book's ending around the time the "Ready to write the ending?" offer
 * appears. Page 1 is the opening (beat 0).
 */
export function beatIndexFor(page: number, beatCount: number, plannedPages: number): number {
  if (beatCount <= 0) return 0;
  const i = Math.floor(((Math.max(page, 1) - 1) * beatCount) / Math.max(plannedPages, 1));
  return Math.min(Math.max(i, 0), beatCount - 1);
}
