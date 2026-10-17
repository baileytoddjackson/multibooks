import type { AdventureMap, AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import type { Chapter, Paragraph } from "@/lib/schemas/content";
import type { InteractionStyle } from "@/lib/client-store/types";

/**
 * Book adventure state machine (pure, no I/O).
 *
 * The reader reads canon. At a choice point they either pick an option (a short generated detour
 * replaces a few original paragraphs, then canon resumes at the rejoin paragraph) or choose to keep
 * reading the original. Every resolution is pushed onto `history`, so undo is a pop.
 */

export type Resolution =
  | {
      cpId: string;
      kind: "detour";
      optionId: string;
      optionLabel: string;
      perspective: string;
      /** Filled in once the detour text arrives. */
      segments: string[];
      narratorFallbackNote?: string;
    }
  | { cpId: string; kind: "original" };

export interface AdventureState {
  style?: InteractionStyle;
  characterId?: string;
  history: Resolution[];
}

export const EMPTY_ADVENTURE: AdventureState = { history: [] };

/* ── Choosing what to show ─────────────────────────────────────────────────────────────── */

export interface ChoiceView {
  options: AdventureOption[];
  /** "narrator" or the character id whose perspective detours are told from. */
  perspective: string;
  /** Set when the reader's character isn't in this scene. */
  narratorFallbackNote?: string;
}

/**
 * Options and perspective for a choice point given the reader's style:
 * - direct:    plot options, narrator
 * - character: the character's own options, their perspective
 * - both:      two of the character's options + one plot option, their perspective
 * A character who isn't in this scene falls back to the narrator with plot options.
 */
export function choiceView(
  cp: ChoicePoint,
  style: InteractionStyle | undefined,
  characterId: string | undefined,
  characterName?: string,
): ChoiceView {
  if (!style || style === "direct" || !characterId) {
    return { options: cp.plotOptions, perspective: "narrator" };
  }
  const own = cp.characterOptions[characterId];
  if (!own || !cp.availableCharacters.includes(characterId)) {
    return {
      options: cp.plotOptions,
      perspective: "narrator",
      narratorFallbackNote: `${characterName ?? "Your character"} isn't in this part of the story, so the narrator tells it.`,
    };
  }
  if (style === "character") return { options: own, perspective: characterId };
  return { options: [...own.slice(0, 2), cp.plotOptions[0]], perspective: characterId };
}

/* ── State transitions ─────────────────────────────────────────────────────────────────── */

export function resolutionFor(state: AdventureState, cpId: string): Resolution | undefined {
  return state.history.find((r) => r.cpId === cpId);
}

export function choose(
  state: AdventureState,
  cp: ChoicePoint,
  option: AdventureOption,
  view: ChoiceView,
): AdventureState {
  const history = state.history.filter((r) => r.cpId !== cp.id);
  history.push({
    cpId: cp.id,
    kind: "detour",
    optionId: option.id,
    optionLabel: option.label,
    perspective: view.perspective,
    segments: [],
    narratorFallbackNote: view.narratorFallbackNote,
  });
  return { ...state, history };
}

export function setDetourText(
  state: AdventureState,
  cpId: string,
  segments: string[],
): AdventureState {
  return {
    ...state,
    history: state.history.map((r) =>
      r.cpId === cpId && r.kind === "detour" ? { ...r, segments } : r,
    ),
  };
}

/** "Keep reading the original" at a choice, or "Return to the original story" from a detour. */
export function returnToOriginal(state: AdventureState, cpId: string): AdventureState {
  const history = state.history.filter((r) => r.cpId !== cpId);
  history.push({ cpId, kind: "original" });
  return { ...state, history };
}

/** "Go back one choice": un-resolves the most recent choice point so its choice shows again. */
export function undo(state: AdventureState): { state: AdventureState; cpId?: string } {
  const last = state.history[state.history.length - 1];
  if (!last) return { state };
  return { state: { ...state, history: state.history.slice(0, -1) }, cpId: last.cpId };
}

export function setStyle(
  state: AdventureState,
  style: InteractionStyle,
  characterId?: string,
): AdventureState {
  return { ...state, style, characterId: style === "direct" ? undefined : characterId };
}

/* ── Laying out a page ─────────────────────────────────────────────────────────────────── */

export type PageBlock =
  | { type: "canon"; paragraphs: Paragraph[] }
  | { type: "choice"; cp: ChoicePoint }
  | { type: "detour"; cp: ChoicePoint; resolution: Extract<Resolution, { kind: "detour" }> };

/**
 * Builds what to show on one page of a chapter in adventure mode.
 * - Paragraphs replaced by a chosen detour are hidden (even if they spill onto later pages).
 * - An unresolved choice point stops the page: nothing after it shows until the reader chooses.
 * Returns `blocked: true` when the reader must choose before turning the page.
 */
export function layoutPage(
  chapter: Pick<Chapter, "index" | "paragraphs">,
  range: { start: number; end: number },
  map: AdventureMap | undefined,
  state: AdventureState,
): { blocks: PageBlock[]; blocked: boolean } {
  const cps = (map?.choicePoints ?? []).filter((cp) => cp.chapter === chapter.index);
  const idx = (id: string) => chapter.paragraphs.findIndex((p) => p.id === id);

  const hidden = new Set<number>();
  for (const cp of cps) {
    const res = resolutionFor(state, cp.id);
    if (res?.kind === "detour") {
      for (let i = idx(cp.anchorAfter) + 1; i < idx(cp.rejoinAt); i++) hidden.add(i);
    }
  }
  const anchors = new Map(cps.map((cp) => [idx(cp.anchorAfter), cp]));

  // An unresolved choice on an earlier page blocks everything after it.
  for (const [a, cp] of anchors) {
    if (a < range.start && !resolutionFor(state, cp.id)) {
      return { blocks: [{ type: "choice", cp }], blocked: true };
    }
  }

  const blocks: PageBlock[] = [];
  let run: Paragraph[] = [];
  const flush = () => {
    if (run.length) blocks.push({ type: "canon", paragraphs: run });
    run = [];
  };

  for (let i = range.start; i < range.end; i++) {
    if (!hidden.has(i)) run.push(chapter.paragraphs[i]);
    const cp = anchors.get(i);
    if (!cp) continue;
    const res = resolutionFor(state, cp.id);
    if (!res) {
      flush();
      blocks.push({ type: "choice", cp });
      return { blocks, blocked: true };
    }
    if (res.kind === "detour") {
      flush();
      blocks.push({ type: "detour", cp, resolution: res });
    }
  }
  flush();
  return { blocks, blocked: false };
}

/** The choice point the reader should be taken to after undo (chapter + paragraph to show). */
export function locateChoicePoint(map: AdventureMap | undefined, cpId: string) {
  const cp = map?.choicePoints.find((c) => c.id === cpId);
  return cp ? { chapter: cp.chapter, paragraphId: cp.anchorAfter } : undefined;
}
