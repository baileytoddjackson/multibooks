import { fateClaims } from "@/lib/content/adventureMap";
import { findBlocked } from "@/lib/safety/blocklist";
import type { AdventureMap } from "@/lib/schemas/adventure";
import { enumerateDetours } from "./enumerate";

/**
 * Content review for the school pilot: every reachable detour, its current text (approved
 * override > cached generation), and a decision the reviewer fills in.
 */
export type Decision = "pending" | "approve" | "reject";

export interface ReviewEntry {
  /** Same key format as approved.json: "m<mapVersion>:<cpId>:<optionId>:<perspective>". */
  key: string;
  cpId: string;
  chapter: number;
  prompt: string;
  optionLabel: string;
  brief: string;
  perspective: string;
  /** Things worth a closer look (fate claims in the brief, blocklist hits in the text). */
  flags: string[];
  source: "approved" | "generated" | "prewarm" | "missing";
  /** Edit freely; approved text is used exactly as written. Blank lines separate paragraphs. */
  text: string;
  decision: Decision;
  notes?: string;
}

export function reviewKey(mapVersion: number, cpId: string, optionId: string, perspective: string) {
  return `m${mapVersion}:${cpId}:${optionId}:${perspective}`;
}

export function buildReviewEntries(
  map: AdventureMap,
  cached: Map<string, { segments: string[]; source: string }>,
  approved: Record<string, { segments: string[] }>,
  previous: ReviewEntry[] = [],
): ReviewEntry[] {
  const fate = new Map<string, string[]>();
  for (const claim of fateClaims(map)) {
    const id = claim.split(":")[0]; // "cp06/ulysses-2"
    fate.set(id, [...(fate.get(id) ?? []), `brief mentions fate: ${claim.slice(id.length + 2)}`]);
  }
  const prev = new Map(previous.map((e) => [e.key, e]));

  return enumerateDetours(map).map(({ cp, option, perspective }) => {
    const key = reviewKey(map.version, cp.id, option.id, perspective);
    const ok = approved[key];
    const gen = cached.get(key);
    const text = (ok?.segments ?? gen?.segments ?? []).join("\n\n");
    const flags = [...(fate.get(`${cp.id}/${option.id}`) ?? [])];
    const blocked = text && findBlocked(text);
    if (blocked) flags.push(`text contains a blocklisted word (${blocked})`);
    const before = prev.get(key);
    return {
      key,
      cpId: cp.id,
      chapter: cp.chapter,
      prompt: cp.prompt,
      optionLabel: option.label,
      brief: option.detourBrief,
      perspective,
      flags,
      source: ok ? "approved" : ((gen?.source as ReviewEntry["source"]) ?? "missing"),
      text,
      // Keep a reviewer's earlier decision/notes; approved overrides start as approved.
      decision: ok ? "approve" : (before?.decision ?? "pending"),
      ...(before?.notes ? { notes: before.notes } : {}),
    };
  });
}

/** Turns review decisions into approved.json content and a list of cache entries to drop. */
export function applyReview(
  entries: ReviewEntry[],
  splitSegments: (text: string) => string[],
): {
  approved: Record<string, { segments: string[] }>;
  rejected: string[];
  pending: number;
  problems: string[];
} {
  const approved: Record<string, { segments: string[] }> = {};
  const rejected: string[] = [];
  const problems: string[] = [];
  let pending = 0;
  for (const e of entries) {
    if (e.decision === "approve") {
      if (!e.text.trim()) problems.push(`${e.key}: approved but has no text`);
      else if (findBlocked(e.text))
        problems.push(`${e.key}: approved text contains a blocklisted word`);
      else approved[e.key] = { segments: splitSegments(e.text) };
    } else if (e.decision === "reject") {
      rejected.push(e.key);
    } else {
      pending++;
    }
  }
  return { approved, rejected, pending, problems };
}
