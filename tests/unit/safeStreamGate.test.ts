import { describe, expect, it } from "vitest";
import { SafeStreamGate } from "@/lib/llm/runGeneration";

function run(chunks: string[]) {
  let out = "";
  const gate = new SafeStreamGate((t) => (out += t));
  chunks.forEach((c) => gate.push(c));
  return { out, blocked: gate.blocked };
}

describe("SafeStreamGate", () => {
  it("releases whole sentences only", () => {
    const { out } = run(["The door cre", "aked open. A cold wi", "nd blew"]);
    expect(out).toBe("The door creaked open.");
  });

  it("stops releasing as soon as blocked text appears", () => {
    const { out, blocked } = run([
      "They found a map. ",
      "Then they got drunk on ",
      "the ship. And sailed on. ",
    ]);
    expect(blocked).toBe(true);
    expect(out).toBe("They found a map.");
  });

  it("checks text that spans chunks", () => {
    const { blocked } = run(["The pirate said a bad word: sh", "it! Then laughed. "]);
    expect(blocked).toBe(true);
  });
});
