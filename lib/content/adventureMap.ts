import { countWords } from "@/lib/content/chunk";
import { OptionSchema } from "@/lib/schemas/adventure";
import type {
  AdventureMap,
  AdventureOption,
  ChoicePoint,
  ChoicePointOutput,
} from "@/lib/schemas/adventure";
import type { Chapter, Character, ChapterSummary } from "@/lib/schemas/content";

/** Max choice points per book (keeps adventures paced and the cache small). */
export const CHOICE_POINT_CAPS: Record<string, number> = {
  alice: 12,
  odyssey: 16,
  "moby-dick": 20,
};

/** Paragraphs a detour may replace before the original resumes. */
export const MAX_SKIPPED_PARAGRAPHS = 6;
/** The first choice comes after the reader has had a real taste of the original. */
export const MIN_INTRO_WORDS = 800;

/**
 * Chapters that never get a choice point (they're still readable as written). Hand-curated from
 * the content notes in summaries.json, because keyword matching can't tell the Queen's comic
 * "Off with her head!" from the Odyssey's genuinely graphic Book XXII. Review before the pilot.
 */
export const EXCLUDED_CHAPTERS: Record<string, Record<number, string>> = {
  alice: {},
  odyssey: {
    8: "Demodocus's song about an affair",
    11: "Underworld; includes a suicide",
    22: "Graphic killing of the suitors and maids",
  },
  "moby-dick": {
    17: "Suicide references",
    66: "Graphic shark gore",
    70: "Severed whale head",
    112: "Suicidal longing",
  },
};

export function isEligibleChapter(
  bookId: string,
  s: Pick<ChapterSummary, "index" | "kind">,
): boolean {
  if (s.kind === "essay") return false;
  return !(s.index in (EXCLUDED_CHAPTERS[bookId] ?? {}));
}

/**
 * Picks chapters for choice points: always chapter 1 (the intro), then eligible chapters
 * spaced evenly through the rest of the book.
 */
export function selectChapters(
  bookId: string,
  summaries: Pick<ChapterSummary, "index" | "kind">[],
  wordCounts: Map<number, number>,
  cap: number,
): number[] {
  const eligible = summaries
    .filter(
      (s) => s.index !== 1 && isEligibleChapter(bookId, s) && (wordCounts.get(s.index) ?? 0) >= 400,
    )
    .map((s) => s.index);
  const picks = [1];
  const want = Math.min(cap - 1, eligible.length);
  for (let i = 0; i < want; i++) {
    // Evenly spaced positions, biased to the middle of each slot.
    const idx = Math.floor(((i + 0.5) * eligible.length) / want);
    const ch = eligible[Math.min(idx, eligible.length - 1)];
    if (!picks.includes(ch)) picks.push(ch);
  }
  return picks.sort((a, b) => a - b);
}

/** Characters a reader may play at a chapter (already introduced in the story). */
export function castAvailableAt(cast: Character[], chapter: number): Character[] {
  return cast.filter((c) => c.firstAppearsChapter <= chapter);
}

function cleanOption(
  id: string,
  o: ChoicePointOutput["plotOptions"][number],
): AdventureOption | null {
  const option = {
    id,
    label: o.label.trim().replace(/\.$/, ""),
    detourBrief: o.detourBrief.trim(),
    mustPreserve: o.mustPreserve
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
  return OptionSchema.safeParse(option).success ? option : null;
}

/** Cleans a list of model options, dropping any that fail validation, and assigns stable ids. */
function cleanOptions(prefix: string, opts: ChoicePointOutput["plotOptions"]): AdventureOption[] {
  return opts
    .map((o) => cleanOption("tmp", o))
    .filter((o): o is AdventureOption => o !== null)
    .slice(0, 3)
    .map((o, i) => ({ ...o, id: `${prefix}${i + 1}` }));
}

/**
 * Turns one model proposal into a validated ChoicePoint, or returns the reasons it was rejected.
 * The model chooses anchors from paragraph ids it was shown; everything is re-checked here.
 * Small slips are repaired rather than rejected (a rejoin on a scene break moves to the next real
 * paragraph; invalid options are dropped) so one bad field doesn't cost a whole choice point.
 */
export function normalizeChoicePoint(
  out: ChoicePointOutput,
  ctx: { chapter: Chapter; cast: Character[]; id: string; isIntro: boolean },
): { ok: true; cp: ChoicePoint; repairs: string[] } | { ok: false; errors: string[] } {
  const { chapter, cast, id, isIntro } = ctx;
  const errors: string[] = [];
  const repairs: string[] = [];
  const paras = chapter.paragraphs;
  const a = paras.findIndex((p) => p.id === out.anchorAfter);
  let r = paras.findIndex((p) => p.id === out.rejoinAt);

  if (a < 0) errors.push(`anchorAfter ${out.anchorAfter} not in chapter ${chapter.index}`);
  if (r < 0) errors.push(`rejoinAt ${out.rejoinAt} not in chapter ${chapter.index}`);
  if (a >= 0 && paras[a].kind === "break") errors.push("anchorAfter is a scene break");
  if (a >= 0 && r >= 0) {
    if (r <= a) {
      r = a + 1;
      repairs.push("rejoinAt moved after anchorAfter");
    }
    while (paras[r]?.kind === "break") {
      r++;
      repairs.push("rejoinAt moved past a scene break");
    }
    if (r >= paras.length) errors.push("no paragraph left to rejoin at");
    else if (r - a - 1 > MAX_SKIPPED_PARAGRAPHS)
      errors.push(`detour skips ${r - a - 1} paragraphs`);
  }
  if (isIntro && a >= 0) {
    const wordsBefore = paras.slice(0, a + 1).reduce((n, p) => n + countWords(p.text), 0);
    if (wordsBefore < MIN_INTRO_WORDS) errors.push(`intro choice after only ${wordsBefore} words`);
  }

  const prompt = out.prompt.trim();
  if (prompt.length < 5 || prompt.length > 200) errors.push("prompt length out of range");

  const plotOptions = cleanOptions("p", out.plotOptions);
  if (plotOptions.length < 2) errors.push("needs at least 2 valid plot options");
  if (plotOptions.length < out.plotOptions.length) repairs.push("dropped invalid plot options");

  const allowed = new Set(castAvailableAt(cast, chapter.index).map((c) => c.id));
  const characterOptions: Record<string, AdventureOption[]> = {};
  for (const entry of out.characterOptions) {
    if (!allowed.has(entry.characterId) || !out.availableCharacters.includes(entry.characterId)) {
      continue;
    }
    const opts = cleanOptions(`${entry.characterId}-`, entry.options);
    if (opts.length >= 2) characterOptions[entry.characterId] = opts;
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    repairs,
    cp: {
      id,
      chapter: chapter.index,
      anchorAfter: out.anchorAfter,
      rejoinAt: paras[r].id,
      prompt,
      isIntro,
      availableCharacters: Object.keys(characterOptions),
      plotOptions,
      characterOptions,
    },
  };
}

/** Structural checks for a committed map against its chapters (used by content:validate). */
export function validateMap(
  map: AdventureMap,
  chapters: Map<number, Pick<Chapter, "index" | "paragraphs">>,
  cast: Character[],
): string[] {
  const errors: string[] = [];
  const cap = CHOICE_POINT_CAPS[map.bookId] ?? 20;
  if (map.choicePoints.length > cap)
    errors.push(`${map.choicePoints.length} choice points (cap ${cap})`);
  if (!map.choicePoints[0]?.isIntro) errors.push("first choice point must be the intro");
  if (map.choicePoints.filter((c) => c.isIntro).length !== 1)
    errors.push("exactly one intro choice point");

  const ids = new Set<string>();
  let last = -1;
  for (const cp of map.choicePoints) {
    if (ids.has(cp.id)) errors.push(`duplicate ${cp.id}`);
    ids.add(cp.id);
    const ch = chapters.get(cp.chapter);
    if (!ch) {
      errors.push(`${cp.id}: chapter ${cp.chapter} missing`);
      continue;
    }
    const a = ch.paragraphs.findIndex((p) => p.id === cp.anchorAfter);
    const r = ch.paragraphs.findIndex((p) => p.id === cp.rejoinAt);
    if (a < 0 || r < 0) errors.push(`${cp.id}: anchor or rejoin not found`);
    else if (r <= a || r - a - 1 > MAX_SKIPPED_PARAGRAPHS)
      errors.push(`${cp.id}: bad rejoin range`);
    const pos = cp.chapter * 10_000 + a;
    if (pos <= last) errors.push(`${cp.id}: choice points out of order`);
    last = pos;
    for (const charId of Object.keys(cp.characterOptions)) {
      const c = cast.find((x) => x.id === charId);
      if (!c) errors.push(`${cp.id}: unknown character ${charId}`);
      else if (c.firstAppearsChapter > cp.chapter)
        errors.push(`${cp.id}: ${charId} not introduced yet`);
    }
  }
  return errors;
}

/** Words that suggest a brief decides someone's fate (only the original may do that). */
const FATE_CLAIM =
  /\b(alive|survive[sd]?|survivors?|unharmed|unhurt|no one is (?:hurt|harmed|lost)|everyone is (?:safe|fine|accounted)|all (?:safe|saved)|dies|died|dead|killed|drowns?|drowned|rescued safely)\b/i;

/**
 * Flags option briefs or must-preserve facts that claim who lives, dies or is safe, for human
 * review. Not an error: some are correct (e.g. "The Parsee is missing"), but each is worth a look,
 * because a wrong claim here becomes a wrong detour for every reader.
 */
export function fateClaims(map: AdventureMap): string[] {
  const out: string[] = [];
  for (const cp of map.choicePoints) {
    const options = [...cp.plotOptions, ...Object.values(cp.characterOptions).flat()];
    for (const o of options) {
      for (const text of [o.detourBrief, ...o.mustPreserve]) {
        const m = FATE_CLAIM.exec(text);
        if (m)
          out.push(
            `${cp.id}/${o.id}: "${m[0]}" in "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`,
          );
      }
    }
  }
  return out;
}
