import { describe, expect, it } from "vitest";
import { JsonStringFieldStreamer } from "@/lib/llm/stream";

function streamAll(json: string, field: string, chunkSize: number) {
  const s = new JsonStringFieldStreamer(field);
  let out = "";
  for (let i = 0; i < json.length; i += chunkSize) out += s.push(json.slice(i, i + chunkSize));
  return { out, finished: s.finished };
}

const doc = JSON.stringify({
  title: 'A "quoted" title with story inside',
  story: 'She said, "Hello!"\n\nThen — ünïcode \\ backslash and é.',
  choices: ["a", "b"],
});

describe("JsonStringFieldStreamer", () => {
  it("extracts the field regardless of chunk boundaries", () => {
    const expected = JSON.parse(doc).story;
    for (const size of [1, 2, 3, 7, 50, 1000]) {
      const { out, finished } = streamAll(doc, "story", size);
      expect(out).toBe(expected);
      expect(finished).toBe(true);
    }
  });

  it("ignores nested fields with the same name", () => {
    const nested = JSON.stringify({ meta: { story: "wrong" }, story: "right" });
    expect(streamAll(nested, "story", 3).out).toBe("right");
  });

  it("handles split unicode escapes", () => {
    const raw = '{"story":"caf\\u00e9!"}';
    expect(streamAll(raw, "story", 1).out).toBe("café!");
  });

  it("returns nothing when the field is absent", () => {
    expect(streamAll('{"other":"x"}', "story", 2)).toEqual({ out: "", finished: false });
  });
});
