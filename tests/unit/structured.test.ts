import { describe, expect, it } from "vitest";
import { z } from "zod";
import { outputFormat, parseStructured } from "@/lib/llm/structured";
import { InvalidOutputError } from "@/lib/llm/types";

const Schema = z.object({
  story: z.string().min(5),
  choices: z.array(z.string()).min(2).max(3),
});

describe("parseStructured", () => {
  it("parses valid JSON", () => {
    expect(parseStructured(Schema, '{"story":"Once upon","choices":["a","b"]}')).toEqual({
      story: "Once upon",
      choices: ["a", "b"],
    });
  });

  it("tolerates code fences", () => {
    const text = '```json\n{"story":"Once upon","choices":["a","b"]}\n```';
    expect(parseStructured(Schema, text).choices).toHaveLength(2);
  });

  it("rejects malformed JSON with InvalidOutputError", () => {
    expect(() => parseStructured(Schema, '{"story": "Once')).toThrow(InvalidOutputError);
  });

  it("enforces constraints the API can't (e.g. array length)", () => {
    const text = '{"story":"Once upon","choices":["a","b","c","d"]}';
    expect(() => parseStructured(Schema, text)).toThrow(/choices/);
  });
});

describe("outputFormat", () => {
  it("produces a serializable json_schema format", () => {
    const fmt = outputFormat(Schema);
    expect(fmt.type).toBe("json_schema");
    expect(JSON.parse(JSON.stringify(fmt))).toEqual(fmt);
    expect(fmt.schema).toHaveProperty("properties.story");
  });
});

import { smartQuotes, splitSegments } from "@/lib/prompts/detour";

describe("detour text clean-up", () => {
  it("curls quotes and apostrophes like the original texts", () => {
    expect(smartQuotes(`"Well, it's late," she said. 'Oh!'`)).toBe(
      "“Well, it’s late,” she said. ‘Oh!’",
    );
  });

  it("splits long detours into two segments at a paragraph break", () => {
    const para = Array(60).fill("word").join(" ");
    expect(splitSegments([para, para, para, para].join("\n\n"))).toHaveLength(2);
    expect(splitSegments("Short one.\n\nShort two.")).toHaveLength(1);
  });
});

import { cleanGeneratedText } from "@/lib/text/clean";

describe("cleanGeneratedText", () => {
  it("removes stray non-Latin characters but keeps accents and punctuation", () => {
    expect(cleanGeneratedText("Slip through the door and探 explore")).toBe(
      "Slip through the door and explore",
    );
    expect(cleanGeneratedText("Café — naïve, 3 o'clock!")).toBe("Café — naïve, 3 o’clock!");
    expect(cleanGeneratedText("Hello 世界 .")).toBe("Hello.");
  });
});
