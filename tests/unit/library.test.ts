import { describe, expect, it } from "vitest";
import type { AdventureStory, BookProgress, CyoStory } from "@/lib/client-store/types";
import {
  applyQuery,
  DEFAULT_QUERY,
  isFiltered,
  libraryEntries,
  parseQuery,
  progressLabel,
  queryParams,
  updatedLabel,
} from "@/lib/library/entries";

const DAY = 24 * 60 * 60 * 1000;
const book = (bookId: BookProgress["bookId"], updatedAt: number, fraction = 0.4): BookProgress => ({
  bookId,
  position: "c001p001",
  fraction,
  wordsRead: 10,
  updatedAt,
});
const seg = { text: "t", summary: "s", choices: [] };
const adventure = (
  id: string,
  bookId: AdventureStory["bookId"],
  title: string,
  updatedAt: number,
): AdventureStory => ({
  id,
  kind: "adventure",
  bookId,
  title,
  segments: [seg, seg, seg],
  cast: [],
  branch: { chapter: 1, cpId: "cp01", optionId: "p1", choice: "Go", perspective: "narrator" },
  status: "active",
  createdAt: 1,
  updatedAt,
});
const cyo = (id: string, title: string, updatedAt: number, done = false): CyoStory => ({
  id,
  title,
  genre: "mystery",
  setting: "A lighthouse",
  segments: [seg],
  cast: [],
  status: done ? "done" : "active",
  createdAt: 1,
  updatedAt,
});

const entries = libraryEntries(
  [book("moby-dick", 50), book("alice", 10, 1)],
  [
    adventure("a1", "alice", "The Café Under the Hill", 40),
    adventure("a2", "moby-dick", "Ahab's Second Chance", 30),
    cyo("c1", "Mia and the Bell", 20, true),
  ],
);
const titles = (q: Partial<typeof DEFAULT_QUERY>) =>
  applyQuery(entries, { ...DEFAULT_QUERY, ...q }).map((e) => e.title);

describe("library entries", () => {
  it("lists books, adventures and Create Your Own stories with their source", () => {
    expect(entries.map((e) => [e.mode, e.source])).toEqual([
      ["canon", "Moby-Dick"],
      ["canon", "Alice in Wonderland"],
      ["adventure", "Alice in Wonderland"],
      ["adventure", "Moby-Dick"],
      ["create", "Mystery"],
    ]);
    expect(entries[0].href).toBe("/read/moby-dick?mode=canon");
    expect(entries[2].href).toBe("/story/a1");
    expect(entries.filter((e) => e.renamable).map((e) => e.id)).toEqual(["a1", "a2", "c1"]);
  });

  it("sorts by most recent, title, or book (Create Your Own last)", () => {
    expect(titles({})).toEqual([
      "Moby-Dick",
      "The Café Under the Hill",
      "Ahab's Second Chance",
      "Mia and the Bell",
      "Alice's Adventures in Wonderland",
    ]);
    expect(titles({ sort: "title" })[0]).toBe("Ahab's Second Chance");
    expect(titles({ sort: "book" })).toEqual([
      "The Café Under the Hill",
      "Alice's Adventures in Wonderland",
      "Moby-Dick",
      "Ahab's Second Chance",
      "Mia and the Bell",
    ]);
  });

  it("filters by mode and by book", () => {
    expect(titles({ mode: "adventure" })).toEqual([
      "The Café Under the Hill",
      "Ahab's Second Chance",
    ]);
    expect(titles({ mode: "create" })).toEqual(["Mia and the Bell"]);
    expect(titles({ book: "alice" })).toEqual([
      "The Café Under the Hill",
      "Alice's Adventures in Wonderland",
    ]);
    expect(titles({ book: "alice", mode: "canon" })).toEqual(["Alice's Adventures in Wonderland"]);
  });

  it("searches titles and sources, ignoring case and accents", () => {
    expect(titles({ q: "cafe" })).toEqual(["The Café Under the Hill"]);
    expect(titles({ q: "MOBY" })).toEqual(["Moby-Dick", "Ahab's Second Chance"]);
    expect(titles({ q: "mystery bell" })).toEqual(["Mia and the Bell"]);
    expect(titles({ q: "dracula" })).toEqual([]);
  });

  it("round-trips the query through the URL and ignores junk", () => {
    const q = { q: "whale", sort: "book" as const, book: "moby-dick", mode: "adventure" as const };
    expect(parseQuery(queryParams(q))).toEqual(q);
    expect(queryParams(DEFAULT_QUERY).toString()).toBe("");
    expect(parseQuery(new URLSearchParams("sort=evil&mode=x&book=dracula"))).toEqual(DEFAULT_QUERY);
    expect(isFiltered(DEFAULT_QUERY)).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, sort: "title" })).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, mode: "canon" })).toBe(true);
  });
});

describe("library labels", () => {
  it("describes progress for each kind", () => {
    const [moby, alice, a1, , c1] = entries;
    expect(progressLabel(moby)).toBe("40% read");
    expect(progressLabel(alice)).toBe("Finished");
    expect(progressLabel(a1)).toBe("3 pages so far");
    expect(progressLabel(c1)).toBe("Finished · 1 page");
  });

  it("says when something was last updated", () => {
    const now = new Date(2026, 10, 21, 15, 0).getTime();
    expect(updatedLabel(now - 60_000, now)).toBe("Today");
    expect(updatedLabel(now - DAY, now)).toBe("Yesterday");
    expect(updatedLabel(now - 3 * DAY, now)).toBe("3 days ago");
    expect(updatedLabel(new Date(2026, 9, 2).getTime(), now)).toBe("Oct 2");
    expect(updatedLabel(new Date(2025, 9, 2).getTime(), now)).toBe("Oct 2, 2025");
  });
});
