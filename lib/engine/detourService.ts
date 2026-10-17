import "server-only";
import { guardGeneration, recordGeneration, type GuardDenial } from "@/lib/budget/budget";
import {
  approvedKey,
  loadAdventureMap,
  loadApprovedDetours,
  loadChapter,
  loadCharacters,
  loadSummaries,
} from "@/lib/content/load";
import { getBook } from "@/lib/content/books";
import { llm } from "@/lib/llm/client";
import { estimateCostUsd } from "@/lib/llm/pricing";
import { InvalidOutputError, type StructuredResult } from "@/lib/llm/types";
import { buildDetourPrompt, splitSegments, type DetourOutput } from "@/lib/prompts/detour";
import { serverStore } from "@/lib/server-store";
import type { DetourPayload } from "@/lib/server-store/ServerStore";
import { detourCacheKey } from "./cacheKey";

export interface DetourRequest {
  bookId: string;
  cpId: string;
  optionId: string;
  /** "narrator" or a character id. */
  perspective: string;
  sessionId: string;
  /** Salted hash of the caller's IP, for rate limiting only. */
  ipHash: string;
}

export type DetourOutcome =
  | { status: "ready"; payload: DetourPayload; cached: boolean; source: string }
  /** Someone else is generating this exact detour right now; poll again shortly. */
  | { status: "pending" }
  | { status: "denied"; reason: GuardDenial; retryAfterSec?: number }
  | { status: "invalid"; message: string }
  | { status: "failed" };

/** Generation lock lifetime: long enough for a slow stream, short enough to recover from a crash. */
const LOCK_TTL_MS = 60_000;

/**
 * Returns a detour from (in order) hand-approved overrides, the shared cache, or a fresh generation.
 * Fresh text is streamed through `onText` as it's written, then cached for every later reader.
 */
export async function getDetour(
  req: DetourRequest,
  onText: (delta: string) => void,
): Promise<DetourOutcome> {
  const book = getBook(req.bookId);
  const map = book && (await loadAdventureMap(book.id));
  const cp = map?.choicePoints.find((c) => c.id === req.cpId);
  if (!book || !map || !cp) return { status: "invalid", message: "Unknown choice point" };

  const option = [...cp.plotOptions, ...Object.values(cp.characterOptions).flat()].find(
    (o) => o.id === req.optionId,
  );
  const perspectiveOk =
    req.perspective === "narrator" || cp.availableCharacters.includes(req.perspective);
  if (!option || !perspectiveOk) return { status: "invalid", message: "Unknown option" };

  // 1. Hand-approved text always wins.
  const approved = (await loadApprovedDetours(book.id))[
    approvedKey(map.version, cp.id, option.id, req.perspective)
  ];
  if (approved) return { status: "ready", payload: approved, cached: true, source: "approved" };

  // 2. Shared cache.
  const store = serverStore();
  const key = detourCacheKey({
    bookId: book.id,
    mapVersion: map.version,
    cpId: cp.id,
    optionId: option.id,
    perspective: req.perspective,
  });
  const hit = await store.getDetour(key);
  if (hit) return { status: "ready", payload: hit.payload, cached: true, source: hit.source };

  // 3. Budget, then the single-flight lock.
  const allowed = await guardGeneration(store, { sessionId: req.sessionId, ipHash: req.ipHash });
  if (!allowed.ok) {
    return { status: "denied", reason: allowed.reason, retryAfterSec: allowed.retryAfterSec };
  }
  if (!(await store.acquireLock(key, LOCK_TTL_MS))) return { status: "pending" };

  try {
    // Another request may have finished between our cache check and taking the lock.
    const raced = await store.getDetour(key);
    if (raced)
      return { status: "ready", payload: raced.payload, cached: true, source: raced.source };

    const [chapter, summaries, cast] = await Promise.all([
      loadChapter(book.id, cp.chapter),
      loadSummaries(book.id),
      loadCharacters(book.id),
    ]);
    if (!chapter) return { status: "invalid", message: "Missing chapter" };
    const character =
      req.perspective === "narrator"
        ? undefined
        : cast.characters.find((c) => c.id === req.perspective);

    const prompt = buildDetourPrompt({
      book,
      chapter,
      chapterSummary: summaries.chapters.find((s) => s.index === cp.chapter)?.summary ?? "",
      previousSummary: summaries.chapters.find((s) => s.index === cp.chapter - 1)?.summary,
      cp,
      option,
      character,
    });

    await recordGeneration(store, req.sessionId);
    const result = await generateWithRetry(prompt, onText, async (r, ok) => {
      await store.logUsage({
        sessionId: req.sessionId,
        kind: "detour",
        model: r?.model ?? "unknown",
        inputTokens: r?.usage.inputTokens ?? 0,
        outputTokens: r?.usage.outputTokens ?? 0,
        cacheReadTokens: r?.usage.cacheReadTokens ?? 0,
        cacheWriteTokens: r?.usage.cacheWriteTokens ?? 0,
        estCostUsd: r ? estimateCostUsd(r.model, r.usage) : 0,
        latencyMs: r?.latencyMs ?? 0,
        bookId: book.id,
        ok,
      });
    });
    if (!result) return { status: "failed" };

    const payload: DetourPayload = { segments: splitSegments(result.data.story) };
    await store.putDetour({
      cacheKey: key,
      bookId: book.id,
      cpId: cp.id,
      optionId: option.id,
      perspective: req.perspective,
      payload,
      source: "generated",
      createdAt: Date.now(),
    });
    return { status: "ready", payload, cached: false, source: "generated" };
  } finally {
    await store.releaseLock(key);
  }
}

type Billed = Pick<StructuredResult<unknown>, "model" | "usage" | "latencyMs">;

/**
 * Streams once; on malformed output retries once without streaming (the reader keeps the
 * "being written" state). Returns undefined after two failures so the UI can fall back gracefully.
 */
async function generateWithRetry(
  prompt: ReturnType<typeof buildDetourPrompt>,
  onText: (delta: string) => void,
  log: (r: Billed | undefined, ok: boolean) => Promise<void>,
): Promise<StructuredResult<DetourOutput> | undefined> {
  const provider = llm();
  try {
    const r = await provider.stream(prompt, onText);
    await log(r, true);
    return r;
  } catch (err) {
    await log(err instanceof InvalidOutputError ? err.billed : undefined, false);
    if (!(err instanceof InvalidOutputError)) console.error("detour stream failed", err);
  }
  try {
    const r = await provider.generate(prompt);
    await log(r, true);
    return r;
  } catch (err) {
    await log(err instanceof InvalidOutputError ? err.billed : undefined, false);
    console.error("detour retry failed", err);
    return undefined;
  }
}
