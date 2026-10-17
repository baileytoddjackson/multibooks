import "server-only";
import { findBlocked } from "@/lib/safety/blocklist";
import { serverStore } from "@/lib/server-store";
import { llm } from "./client";
import { estimateCostUsd } from "./pricing";
import { InvalidOutputError, type StructuredRequest, type StructuredResult } from "./types";

/**
 * Releases streamed text to the reader one sentence at a time, and only after the text so far
 * passes the blocklist. Once something trips it, nothing more is released for this attempt.
 */
export class SafeStreamGate {
  private buf = "";
  private released = 0;
  blocked = false;

  constructor(private readonly emit: (text: string) => void) {}

  push(delta: string) {
    if (this.blocked) return;
    this.buf += delta;
    const lastBoundary = Math.max(
      this.buf.lastIndexOf(". "),
      this.buf.lastIndexOf("! "),
      this.buf.lastIndexOf("? "),
      this.buf.lastIndexOf("\n"),
      this.buf.lastIndexOf("” "),
    );
    if (lastBoundary + 1 <= this.released) return;
    if (findBlocked(this.buf)) {
      this.blocked = true;
      return;
    }
    this.emit(this.buf.slice(this.released, lastBoundary + 1));
    this.released = lastBoundary + 1;
  }
}

export interface RunOptions<T> {
  sessionId: string;
  bookId?: string;
  /** Called with text safe to show while the first attempt streams. */
  onText?: (delta: string) => void;
  /** Called if streamed text must be discarded (the retry starts fresh). */
  onReset?: () => void;
  /** Extra acceptance check (e.g. blocklist on every field). */
  accept?: (data: T) => boolean;
}

/**
 * One streamed attempt, then one non-streamed retry with a stricter reminder if the output was
 * malformed or failed `accept`. Every attempt's billed usage is logged against the budget.
 * Returns undefined after two failures so the caller can show a friendly fallback.
 */
export async function runGeneration<T>(
  req: StructuredRequest<T>,
  opts: RunOptions<T>,
): Promise<StructuredResult<T> | undefined> {
  const provider = llm();
  const store = serverStore();
  const log = async (
    r: Pick<StructuredResult<T>, "model" | "usage" | "latencyMs"> | undefined,
    ok: boolean,
  ) =>
    store.logUsage({
      sessionId: opts.sessionId,
      kind: req.kind,
      model: r?.model ?? "unknown",
      inputTokens: r?.usage.inputTokens ?? 0,
      outputTokens: r?.usage.outputTokens ?? 0,
      cacheReadTokens: r?.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: r?.usage.cacheWriteTokens ?? 0,
      estCostUsd: r ? estimateCostUsd(r.model, r.usage) : 0,
      latencyMs: r?.latencyMs ?? 0,
      bookId: opts.bookId,
      ok,
    });

  // Attempt 1: stream through the safety gate.
  const gate = new SafeStreamGate((t) => opts.onText?.(t));
  try {
    const r = opts.onText
      ? await provider.stream(req, (d) => gate.push(d))
      : await provider.generate(req);
    const ok = !gate.blocked && (opts.accept?.(r.data) ?? true);
    await log(r, ok);
    if (ok) return r;
  } catch (err) {
    await log(err instanceof InvalidOutputError ? err.billed : undefined, false);
    if (!(err instanceof InvalidOutputError)) console.error(`${req.kind} attempt 1 failed`, err);
  }

  // Attempt 2: no streaming, stricter reminder.
  opts.onReset?.();
  const strict: StructuredRequest<T> = {
    ...req,
    user: `${req.user}\n\nImportant: follow every safety rule strictly, and keep the language gentle and school-appropriate.`,
  };
  try {
    const r = await provider.generate(strict);
    const ok = opts.accept?.(r.data) ?? true;
    await log(r, ok);
    return ok ? r : undefined;
  } catch (err) {
    await log(err instanceof InvalidOutputError ? err.billed : undefined, false);
    console.error(`${req.kind} attempt 2 failed`, err);
    return undefined;
  }
}
