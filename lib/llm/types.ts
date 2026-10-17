import type { z } from "zod";
import type { Effort } from "./models";
import type { TokenUsage } from "./pricing";

/** Every model call is tagged so usage and cost can be broken down in /admin/stats. */
export type UsageKind = "detour" | "cyo_open" | "cyo_cont" | "moderation" | "offline";

export interface StructuredRequest<T> {
  kind: UsageKind;
  /** Stable instructions. Marked for prompt caching (helps once a model's cache minimum is met). */
  system: string;
  /** Per-request content. */
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  /** Overrides the default model (MODEL_RUNTIME / MODEL_OFFLINE). */
  model?: string;
  /** Name of the top-level string field to stream to the reader as it's written (e.g. "story"). */
  streamField?: string;
  /** Thinking depth on models that support it; defaults to "low" for short story segments. */
  effort?: Effort;
  /** Canned output used by the mock provider (tests, local dev without a key). */
  mock: () => T;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  stopReason: string | null;
}

export interface LLMProvider {
  readonly name: "anthropic" | "mock";
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /**
   * Streams `req.streamField` text deltas through `onText`, then resolves with the validated object.
   */
  stream<T>(
    req: StructuredRequest<T>,
    onText: (delta: string) => void,
  ): Promise<StructuredResult<T>>;
}

/** Thrown when the model's output can't be parsed/validated. Callers retry once, then fall back. */
export class InvalidOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
    /** Billed usage for the failed call, so spend is still tracked against the budget. */
    readonly billed?: { model: string; usage: TokenUsage; latencyMs: number },
  ) {
    super(message);
    this.name = "InvalidOutputError";
  }
}
