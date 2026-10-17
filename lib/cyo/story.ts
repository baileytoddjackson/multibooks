import type {
  CyoCastMember,
  CyoSegment,
  CyoStory,
  InteractionStyle,
} from "@/lib/client-store/types";

/**
 * Create Your Own story state (pure). The story is a list of segments; each one remembers the
 * summary and choices that followed it, so undo is simply "drop the last segment".
 */

export interface OpeningResult {
  title: string;
  story: string;
  summary: string;
  cast: { name: string; oneLine: string }[];
  choices: string[];
}

export interface ContinuationResult {
  story: string;
  summary: string;
  choices: string[];
  isEnding: boolean;
}

function slug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "hero";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export function createStory(
  id: string,
  input: { genre: string; setting: string; details?: string },
  opening: OpeningResult,
  now = Date.now(),
): CyoStory {
  const taken = new Set<string>();
  const cast: CyoCastMember[] = opening.cast.map((c) => ({
    id: slug(c.name, taken),
    name: c.name,
    oneLine: c.oneLine,
  }));
  return {
    id,
    title: opening.title,
    genre: input.genre,
    setting: input.setting,
    details: input.details,
    segments: [{ text: opening.story, summary: opening.summary, choices: opening.choices }],
    cast,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

export function lastSegment(s: CyoStory): CyoSegment {
  return s.segments[s.segments.length - 1];
}

/** Turn number = segments written so far (the opening is turn 1). */
export function turn(s: CyoStory): number {
  return s.segments.length;
}

/** Segments in a row since the reader last made a choice. */
export function segmentsSinceChoice(s: CyoStory): number {
  let n = 0;
  for (let i = s.segments.length - 1; i > 0; i--) {
    if (s.segments[i].choiceMade) break;
    n++;
  }
  return n;
}

/**
 * A choice point every 1-3 segments. After a choice, the next segment may skip choices
 * ("Keep reading"); once one segment has gone by without a choice, the next one must offer them.
 */
export function mustOfferChoices(s: CyoStory): boolean {
  return segmentsSinceChoice(s) >= 1;
}

export type WrapUp = "none" | "offer" | "forced";

/**
 * Soft cap: from `softCap` turns on, offer "Ready to write the ending?". Hard cap: the next
 * segment must be the ending.
 */
export function wrapUpState(s: CyoStory, softCap: number, hardCap: number): WrapUp {
  if (s.status === "done") return "none";
  const t = turn(s);
  if (t >= hardCap - 1) return "forced";
  if (t >= softCap) return "offer";
  return "none";
}

export function appendSegment(
  s: CyoStory,
  choiceMade: string | undefined,
  res: ContinuationResult,
  now = Date.now(),
): CyoStory {
  const seg: CyoSegment = {
    text: res.story,
    choiceMade,
    summary: res.summary,
    choices: res.isEnding ? [] : res.choices,
    isEnding: res.isEnding || undefined,
  };
  return {
    ...s,
    segments: [...s.segments, seg],
    status: res.isEnding ? "done" : "active",
    updatedAt: now,
  };
}

/** "Go back one choice": removes segments back to (and including) the last chosen one. */
export function undoLastChoice(s: CyoStory, now = Date.now()): CyoStory {
  if (s.segments.length <= 1) return s;
  let i = s.segments.length - 1;
  while (i > 0 && !s.segments[i].choiceMade) i--;
  const keep = Math.max(1, i);
  return { ...s, segments: s.segments.slice(0, keep), status: "active", updatedAt: now };
}

export function canUndo(s: CyoStory): boolean {
  return s.segments.length > 1;
}

export function setStoryStyle(
  s: CyoStory,
  style: InteractionStyle,
  characterId?: string,
): CyoStory {
  return {
    ...s,
    style,
    characterId: style === "direct" ? undefined : characterId,
    updatedAt: Date.now(),
  };
}

export function renameStory(s: CyoStory, title: string): CyoStory {
  const t = title.trim().slice(0, 80);
  return t ? { ...s, title: t, updatedAt: Date.now() } : s;
}

export function wordCount(s: CyoStory): number {
  return s.segments.reduce((n, seg) => n + seg.text.split(/\s+/).filter(Boolean).length, 0);
}
