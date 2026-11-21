import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SavedRecord, ServerStore } from "@/lib/server-store/ServerStore";
import { BACKENDS } from "./storeBackends";

const user = (id: string, email: string) => ({
  id,
  email,
  passwordHash: "scrypt$hash",
  createdAt: 1,
});

const saved = (id: string, updatedAt: number, data: unknown = { v: updatedAt }): SavedRecord => ({
  kind: "story",
  id,
  title: `Story ${id}`,
  data,
  createdAt: 1,
  updatedAt,
});

describe.each(BACKENDS)("accounts and saved stories on $name", ({ make }) => {
  let store: ServerStore;
  let cleanup: () => Promise<void>;
  beforeEach(async () => {
    ({ store, cleanup } = await make());
  });
  afterEach(async () => cleanup());

  it("creates users with unique emails", async () => {
    expect(await store.createUser(user("u1", "a@example.com"))).toBe(true);
    expect(await store.createUser(user("u2", "a@example.com"))).toBe(false);
    expect((await store.getUserByEmail("a@example.com"))?.id).toBe("u1");
    expect(await store.getUserByEmail("b@example.com")).toBeUndefined();
    expect(await store.countUsers()).toBe(1);
    await store.setPasswordHash("u1", "scrypt$new");
    expect((await store.getUserByEmail("a@example.com"))?.passwordHash).toBe("scrypt$new");
  });

  it("resolves live sessions only", async () => {
    await store.createUser(user("u1", "a@example.com"));
    await store.createSession({ tokenHash: "live", userId: "u1", expiresAt: Date.now() + 60_000 });
    await store.createSession({ tokenHash: "old", userId: "u1", expiresAt: Date.now() - 1 });
    expect(await store.getSessionUser("live")).toEqual({ id: "u1", email: "a@example.com" });
    expect(await store.getSessionUser("old")).toBeUndefined();
    expect(await store.getSessionUser("nope")).toBeUndefined();
    await store.deleteSession("live");
    expect(await store.getSessionUser("live")).toBeUndefined();
  });

  it("ends every session for a user", async () => {
    await store.createUser(user("u1", "a@example.com"));
    const exp = Date.now() + 60_000;
    await store.createSession({ tokenHash: "t1", userId: "u1", expiresAt: exp });
    await store.createSession({ tokenHash: "t2", userId: "u1", expiresAt: exp });
    await store.deleteUserSessions("u1");
    expect(await store.getSessionUser("t1")).toBeUndefined();
    expect(await store.getSessionUser("t2")).toBeUndefined();
  });

  it("keeps each user's saved stories separate, newest first", async () => {
    await store.createUser(user("u1", "a@example.com"));
    await store.createUser(user("u2", "b@example.com"));
    await store.putSaved("u1", saved("s1", 10));
    await store.putSaved("u1", saved("s2", 20));
    await store.putSaved("u2", saved("s1", 5));
    expect((await store.listSaved("u1")).map((s) => s.id)).toEqual(["s2", "s1"]);
    expect((await store.listSaved("u2")).map((s) => s.data)).toEqual([{ v: 5 }]);
    await store.deleteSaved("u1", "story", "s1");
    expect((await store.listSaved("u1")).map((s) => s.id)).toEqual(["s2"]);
    expect(await store.listSaved("u2")).toHaveLength(1);
  });

  it("ignores writes older than what's stored", async () => {
    await store.createUser(user("u1", "a@example.com"));
    expect(await store.putSaved("u1", saved("s1", 10))).toBe(true);
    expect(await store.putSaved("u1", saved("s1", 5, { stale: true }))).toBe(false);
    expect(await store.putSaved("u1", saved("s1", 12, { fresh: true }))).toBe(true);
    const [s] = await store.listSaved("u1");
    expect(s.data).toEqual({ fresh: true });
    expect(s.updatedAt).toBe(12);
  });

  it("stores book progress alongside stories under its own kind", async () => {
    await store.createUser(user("u1", "a@example.com"));
    await store.putSaved("u1", { ...saved("alice", 3), kind: "book", bookId: "alice" });
    await store.putSaved("u1", saved("alice", 4));
    const all = await store.listSaved("u1");
    expect(all.map((s) => [s.kind, s.id])).toEqual([
      ["story", "alice"],
      ["book", "alice"],
    ]);
    expect(all[1].bookId).toBe("alice");
  });
});
