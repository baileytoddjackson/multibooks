import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RemoteError,
  SignedOutError,
  type RemoteApi,
  type UserData,
} from "@/lib/client-store/remote";
import { createMemoryStorage, SyncedProgressStore } from "@/lib/client-store/syncedStore";
import type { BookProgress, CyoStory } from "@/lib/client-store/types";

const progress = (
  bookId: BookProgress["bookId"],
  updatedAt: number,
  fraction = 0.1,
): BookProgress => ({
  bookId,
  mode: "canon",
  position: "c001p001",
  fraction,
  wordsRead: 100,
  updatedAt,
});

const story = (id: string, updatedAt = 1): CyoStory => ({
  id,
  title: "The Glass Lighthouse",
  genre: "mystery",
  setting: "A lighthouse made of glass",
  segments: [{ text: "Once...", summary: "Start.", choices: ["Climb", "Knock"] }],
  cast: [{ id: "mia", name: "Mia", oneLine: "A brave kid" }],
  status: "active",
  createdAt: 1,
  updatedAt,
});

function fakeRemote(data: Partial<UserData> = {}) {
  const puts: { kind: string; id: string; body: unknown }[] = [];
  const removes: { kind: string; id: string }[] = [];
  const remote: RemoteApi & { failNext?: Error } = {
    load: vi.fn(async () => ({
      user: { email: "reader@example.com" },
      books: [],
      stories: [],
      ...data,
    })),
    put: vi.fn(async (kind, id, body) => {
      if (remote.failNext) {
        const e = remote.failNext;
        remote.failNext = undefined;
        throw e;
      }
      puts.push({ kind, id, body: structuredClone(body) });
    }),
    remove: vi.fn(async (kind, id) => void removes.push({ kind, id })),
  };
  return { remote, puts, removes };
}

function makeStore(remote: RemoteApi, opts = {}) {
  return new SyncedProgressStore(createMemoryStorage(), remote, {
    writeDelayMs: 100,
    retryDelayMs: 100,
    ...opts,
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SyncedProgressStore: device data", () => {
  it("creates a stable anonymous session", () => {
    const store = makeStore(fakeRemote().remote);
    const a = store.getSession();
    expect(a.anonId).toBeTruthy();
    expect(store.getSession().anonId).toBe(a.anonId);
  });

  it("sets and clears a session code without changing the anon id", () => {
    const store = makeStore(fakeRemote().remote);
    const { anonId } = store.getSession();
    expect(store.setSessionCode("LIB-OCT20").sessionCode).toBe("LIB-OCT20");
    const cleared = store.setSessionCode("");
    expect(cleared.sessionCode).toBeUndefined();
    expect(cleared.anonId).toBe(anonId);
  });

  it("survives corrupt storage", () => {
    const storage = createMemoryStorage();
    storage.setItem("multibooks:v1:prefs", "{not json");
    const store = new SyncedProgressStore(storage, fakeRemote().remote);
    expect(store.getReaderPrefs()).toEqual({ fontSize: "m", theme: "light" });
  });

  it("never sends the anonymous id with account data", async () => {
    const { remote, puts } = fakeRemote();
    const store = makeStore(remote);
    const { anonId } = store.getSession();
    store.saveBookProgress(progress("alice", 1));
    await vi.advanceTimersByTimeAsync(150);
    expect(JSON.stringify(puts)).not.toContain(anonId);
  });
});

describe("SyncedProgressStore: account data", () => {
  it("loads saved data from the server", async () => {
    const onChange = vi.fn();
    const { remote } = fakeRemote({ books: [progress("odyssey", 5)], stories: [story("s1")] });
    const store = makeStore(remote, { onChange });
    expect(store.status()).toBe("loading");
    await store.load();
    expect(store.status()).toBe("ready");
    expect(store.account()?.email).toBe("reader@example.com");
    expect(store.getBookProgress("odyssey")?.updatedAt).toBe(5);
    expect(store.getStory("s1")).toBeTruthy();
    expect(onChange).toHaveBeenCalled();
    await store.load();
    expect(remote.load).toHaveBeenCalledTimes(1);
  });

  it("keeps local changes made while loading if they're newer", async () => {
    const { remote } = fakeRemote({ books: [progress("alice", 5, 0.2)] });
    const store = makeStore(remote);
    store.saveBookProgress(progress("alice", 9, 0.5));
    await store.load();
    expect(store.getBookProgress("alice")?.fraction).toBe(0.5);
  });

  it("lists book progress most-recent first", async () => {
    const store = makeStore(fakeRemote().remote);
    await store.load();
    store.saveBookProgress(progress("alice", 1));
    store.saveBookProgress(progress("moby-dick", 3));
    store.saveBookProgress(progress("odyssey", 2));
    expect(store.listBookProgress().map((p) => p.bookId)).toEqual([
      "moby-dick",
      "odyssey",
      "alice",
    ]);
  });

  it("coalesces rapid changes into one write with the latest data", async () => {
    const { remote, puts } = fakeRemote();
    const store = makeStore(remote);
    await store.load();
    for (let i = 1; i <= 5; i++) store.saveBookProgress(progress("alice", i, i / 10));
    expect(puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(puts).toEqual([{ kind: "book", id: "alice", body: progress("alice", 5, 0.5) }]);
  });

  it("flush sends pending writes immediately", async () => {
    const { remote, puts } = fakeRemote();
    const store = makeStore(remote);
    store.saveStory(story("s1"));
    await store.flush();
    expect(puts.map((p) => p.id)).toEqual(["s1"]);
    expect(remote.put).toHaveBeenCalledWith("create", "s1", expect.anything(), {
      keepalive: true,
    });
  });

  it("retries a failed write, but not a rejected one", async () => {
    const { remote, puts } = fakeRemote();
    const store = makeStore(remote);
    remote.failNext = new TypeError("network down");
    store.saveStory(story("s1"));
    await vi.advanceTimersByTimeAsync(150);
    expect(puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(puts).toHaveLength(1);

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    remote.failNext = new RemoteError(400, false);
    store.saveStory(story("s2"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(puts).toHaveLength(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("deletes cancel pending writes and stay deleted when server data arrives", async () => {
    const { remote, puts, removes } = fakeRemote({ stories: [story("s1")] });
    const store = makeStore(remote);
    store.saveStory(story("s2"));
    store.deleteStory("s2");
    store.deleteStory("s1");
    await store.load();
    await vi.advanceTimersByTimeAsync(150);
    expect(puts).toHaveLength(0);
    expect(removes.map((r) => r.id)).toEqual(["s2", "s1"]);
    expect(store.listStories()).toEqual([]);
  });

  it("reports a signed-out session", async () => {
    const onSignedOut = vi.fn();
    const { remote } = fakeRemote();
    remote.load = vi.fn(async () => {
      throw new SignedOutError();
    });
    const store = makeStore(remote, { onSignedOut });
    await store.load();
    expect(onSignedOut).toHaveBeenCalled();
    expect(store.status()).toBe("error");
  });

  it("can retry after a failed load", async () => {
    const { remote } = fakeRemote();
    const ok = remote.load;
    remote.load = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const store = makeStore(remote);
    await store.load();
    expect(store.status()).toBe("error");
    remote.load = ok;
    await store.retry();
    expect(store.status()).toBe("ready");
  });
});
