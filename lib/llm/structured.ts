import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { InvalidOutputError } from "./types";

/**
 * Serializable `output_config.format` for a Zod schema (safe to put in Batch API requests).
 * The API ignores constraints it can't enforce (lengths, counts); `parseStructured` re-checks them.
 */
export function outputFormat(schema: z.ZodType) {
  const { type, schema: jsonSchema } = zodOutputFormat(schema);
  return { type, schema: jsonSchema };
}

/** Parses model text as JSON and validates it, tolerating stray code fences. */
export function parseStructured<T>(schema: z.ZodType<T>, text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new InvalidOutputError("Model output was not valid JSON", text);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new InvalidOutputError(`Model output failed validation: ${issues}`, text);
  }
  return result.data;
}
