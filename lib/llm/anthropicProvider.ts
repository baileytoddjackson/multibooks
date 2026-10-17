import Anthropic from "@anthropic-ai/sdk";
import { effortConfig } from "./models";
import { JsonStringFieldStreamer } from "./stream";
import { outputFormat, parseStructured } from "./structured";
import {
  InvalidOutputError,
  type LLMProvider,
  type StructuredRequest,
  type StructuredResult,
} from "./types";
import type { TokenUsage } from "./pricing";

function usageOf(u: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Real provider. The API key is read by the SDK from ANTHROPIC_API_KEY (server-side only). */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(private readonly defaultModel: string) {
    // Short, latency-sensitive calls: fail fast and let the app show a friendly retry.
    this.client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  }

  private params<T>(req: StructuredRequest<T>) {
    const model = req.model ?? this.defaultModel;
    return {
      model,
      max_tokens: req.maxTokens,
      system: [
        { type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } },
      ],
      messages: [{ role: "user" as const, content: req.user }],
      output_config: {
        format: outputFormat(req.schema),
        ...effortConfig(model, req.effort ?? "low"),
      },
    };
  }

  private finish<T>(
    req: StructuredRequest<T>,
    msg: Anthropic.Message,
    started: number,
  ): StructuredResult<T> {
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const billed = { model: msg.model, usage: usageOf(msg.usage), latencyMs: Date.now() - started };
    if (msg.stop_reason === "max_tokens") {
      throw new InvalidOutputError("Model ran out of output tokens", text, billed);
    }
    if (msg.stop_reason === "refusal") {
      throw new InvalidOutputError("Model declined the request", text, billed);
    }
    try {
      return { data: parseStructured(req.schema, text), ...billed, stopReason: msg.stop_reason };
    } catch (err) {
      if (err instanceof InvalidOutputError)
        throw new InvalidOutputError(err.message, text, billed);
      throw err;
    }
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const started = Date.now();
    const msg = await this.client.messages.create(this.params(req));
    return this.finish(req, msg, started);
  }

  async stream<T>(
    req: StructuredRequest<T>,
    onText: (delta: string) => void,
  ): Promise<StructuredResult<T>> {
    const started = Date.now();
    const field = req.streamField ? new JsonStringFieldStreamer(req.streamField) : undefined;
    const stream = this.client.messages.stream(this.params(req));
    for await (const event of stream) {
      if (field && event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const delta = field.push(event.delta.text);
        if (delta) onText(delta);
      }
    }
    return this.finish(req, await stream.finalMessage(), started);
  }
}
