import { describe, expect, it } from "vitest";
import { findBlocked, normalize } from "@/lib/safety/blocklist";
import { findPii } from "@/lib/safety/piiPatterns";

describe("blocklist", () => {
  it("allows ordinary story ideas, including spooky and adventurous ones", () => {
    for (const ok of [
      "A haunted castle with a friendly ghost",
      "A dragon battle on a stormy mountain",
      "Our class goes on a trip to a glass lighthouse",
      "A detective who solves the case of the missing bass guitar",
      "The crack of thunder woke the whole village",
      "A pirate drinks root beer on the deck",
      "Assemble the crew and pass the compass",
    ]) {
      expect(findBlocked(ok), ok).toBeUndefined();
    }
  });

  it("catches clear problems, including common spelling tricks", () => {
    expect(findBlocked("a story about s3x")).toBe("sexual");
    expect(findBlocked("this is so f*cking cool")).toBeUndefined(); // masked by the writer: fine
    expect(findBlocked("FUUUUCK")).toBe("profanity");
    expect(findBlocked("the hero wants to kill myself")).toBe("self_harm");
    expect(findBlocked("they all get high on weed")).toBe("drugs");
    expect(findBlocked("a school shooting")).toBe("graphic_violence");
  });

  it("normalizes leetspeak and separators", () => {
    expect(normalize("H3LL0  W0RLD!!")).toBe("hello world");
    expect(normalize("self-harm")).toBe("self harm");
  });
});

describe("personal information", () => {
  it("flags contact details and self-identifying phrases", () => {
    expect(findPii("email me at kid@example.com")).toBe("email");
    expect(findPii("call 555-123-4567")).toBe("phone");
    expect(findPii("set at 42 Maple Street")).toBe("address");
    expect(findPii("my name is Jordan and I like dragons")).toBe("self_name");
    expect(findPii("I live in Springfield")).toBe("self_location");
    expect(findPii("the kids at Lincoln Middle School")).toBe("school");
    expect(findPii("follow @coolkid123")).toBe("handle");
  });

  it("allows made-up characters and places", () => {
    expect(findPii("a girl named Zara and her robot dog Bolt")).toBeUndefined();
    expect(findPii("a school for wizards on the moon")).toBeUndefined();
    expect(findPii("1000 years in the future")).toBeUndefined();
  });
});
