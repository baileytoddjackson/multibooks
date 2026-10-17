import { describe, expect, it } from "vitest";
import { EventBatchSchema, parseEvent } from "@/lib/analytics/events";

describe("analytics events", () => {
  it("accepts known events with valid props", () => {
    expect(
      parseEvent("choice_made", { context: "book", bookId: "alice", cpId: "cp01", optionId: "p2" }),
    ).toEqual({
      context: "book",
      bookId: "alice",
      cpId: "cp01",
      optionId: "p2",
    });
    expect(parseEvent("create_started", {})).toEqual({});
  });

  it("drops unknown types, bad props and anything that could carry free text", () => {
    expect(parseEvent("made_up_event", {})).toBeNull();
    expect(parseEvent("book_selected", { bookId: "My Name Is Jordan" })).toBeNull();
    expect(parseEvent("words_read", { context: "book", words: -5 })).toBeNull();
    // Extra fields are stripped, not stored.
    expect(parseEvent("feedback_clicked", { note: "hello" })).toEqual({});
  });

  it("only accepts uppercase group codes and small batches", () => {
    const ev = { type: "create_started", props: {}, ts: 1 };
    expect(
      EventBatchSchema.safeParse({ sessionId: "abcdefgh", sessionCode: "LIB-OCT20", events: [ev] })
        .success,
    ).toBe(true);
    expect(
      EventBatchSchema.safeParse({
        sessionId: "abcdefgh",
        sessionCode: "jordan smith",
        events: [ev],
      }).success,
    ).toBe(false);
    expect(
      EventBatchSchema.safeParse({ sessionId: "abcdefgh", events: Array(51).fill(ev) }).success,
    ).toBe(false);
  });
});
