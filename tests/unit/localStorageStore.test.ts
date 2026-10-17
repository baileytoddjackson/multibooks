import { describe, expect, it } from "vitest";
import {
  createMemoryStorage,
  LocalStorageProgressStore,
} from "@/lib/client-store/localStorageStore";
import type { BookProgress, CyoStory } from "@/lib/client-store/types";

function makeStore() {
  return new LocalStorageProgressStore(createMemoryStorage());
}

const progress = (bookId: BookProgress["bookId"], updatedAt: number): BookProgress => ({
  bookId,
  mode: "canon",
  position: "c01p001",
  fraction: 0.1,
  wordsRead: 100,
  updatedAt,
});

describe("LocalStorageProgressStore", () => {
  it("creates a stable anonymous session", () => {
    const store = makeStore();
    const a = store.getSession();
    expect(a.anonId).toBeTruthy();
    expect(store.getSession().anonId).toBe(a.anonId);
  });

  it("sets and clears a session code without changing the anon id", () => {
    const store = makeStore();
    const { anonId } = store.getSession();
    expect(store.setSessionCode("LIB-OCT20").sessionCode).toBe("LIB-OCT20");
    const cleared = store.setSessionCode("");
    expect(cleared.sessionCode).toBeUndefined();
    expect(cleared.anonId).toBe(anonId);
  });

  it("lists book progress most-recent first", () => {
    const store = makeStore();
    store.saveBookProgress(progress("alice", 1));
    store.saveBookProgress(progress("moby-dick", 3));
    store.saveBookProgress(progress("odyssey", 2));
    expect(store.listBookProgress().map((p) => p.bookId)).toEqual([
      "moby-dick",
      "odyssey",
      "alice",
    ]);
    store.clearBookProgress("odyssey");
    expect(store.getBookProgress("odyssey")).toBeUndefined();
  });

  it("round-trips stories", () => {
    const store = makeStore();
    const story: CyoStory = {
      id: "s1",
      title: "The Glass Lighthouse",
      genre: "mystery",
      setting: "A lighthouse made of glass",
      summary: "",
      segments: [{ text: "Once..." }],
      pendingChoices: ["Climb the stairs", "Knock on the door"],
      turn: 1,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
    store.saveStory(story);
    expect(store.getStory("s1")).toEqual(story);
    expect(store.listStories()).toHaveLength(1);
    store.deleteStory("s1");
    expect(store.listStories()).toHaveLength(0);
  });

  it("survives corrupt storage", () => {
    const storage = createMemoryStorage();
    storage.setItem("multibooks:v1:books", "{not json");
    const store = new LocalStorageProgressStore(storage);
    expect(store.listBookProgress()).toEqual([]);
    expect(store.getReaderPrefs()).toEqual({ fontSize: "m", theme: "light" });
  });
});
