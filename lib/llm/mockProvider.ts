import type { LLMProvider, StructuredRequest, StructuredResult } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free, deterministic provider for tests and local dev. Returns each request's `mock()` output and
 * "streams" its stream field in small chunks so the writing animation can be exercised.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock" as const;

  constructor(private readonly opts: { chunkDelayMs?: number } = {}) {}

  private result<T>(req: StructuredRequest<T>, started: number): StructuredResult<T> {
    const data = req.schema.parse(req.mock());
    return {
      data,
      model: "mock",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      latencyMs: Date.now() - started,
      stopReason: "end_turn",
    };
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    return this.result(req, Date.now());
  }

  async stream<T>(
    req: StructuredRequest<T>,
    onText: (delta: string) => void,
  ): Promise<StructuredResult<T>> {
    const started = Date.now();
    const res = this.result(req, started);
    const text = req.streamField
      ? (res.data as Record<string, unknown>)[req.streamField]
      : undefined;
    if (typeof text === "string") {
      const delay = this.opts.chunkDelayMs ?? 15;
      for (let i = 0; i < text.length; i += 24) {
        onText(text.slice(i, i + 24));
        if (delay) await sleep(delay);
      }
    }
    return { ...res, latencyMs: Date.now() - started };
  }
}
