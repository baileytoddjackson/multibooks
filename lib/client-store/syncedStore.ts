import type { BookId } from "@/lib/schemas/content";
import { DEFAULT_READER_PREFS, type ProgressStore } from "./ProgressStore";
import type { RemoteApi, RemoteKind, UserData } from "./remote";
import { RemoteError, SignedOutError } from "./remote";
import type { BookProgress, ReaderPrefs, Session, Story } from "./types";

/**
 * The client store for a signed-in reader.
 *
 * - Book progress and stories belong to the account: loaded once per page from the server, kept
 *   in memory so the UI can read them synchronously, and written back shortly after each change
 *   (one coalesced write per record, flushed when the page is hidden).
 * - Until the server confirms a write, the change also waits in a localStorage outbox, so it
 *   survives the page closing mid-request.
 * - The anonymous analytics session and reader preferences belong to the device and stay in
 *   localStorage. The analytics id is never sent with account data, so research events can't be
 *   linked to an account.
 */
export type StoreStatus = "loading" | "ready" | "error";

const PREFIX = "multibooks:v1:";
const DEVICE_KEYS = {
  session: `${PREFIX}session`,
  prefs: `${PREFIX}prefs`,
  outbox: `${PREFIX}outbox`,
} as const;

/**
 * Changes the server hasn't confirmed yet, kept in localStorage so none are lost if the page
 * closes mid-request (or a new page loads before the save lands). Merged back in and re-sent
 * after the next load, but only for the same account.
 */
interface Outbox {
  email?: string;
  records: Record<string, { kind: RemoteKind; id: string; body: BookProgress | Story }>;
}

/** Minimal Storage surface so tests can pass an in-memory map. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SyncedStoreOptions {
  /** Called after any change, including when server data arrives. */
  onChange?: () => void;
  /** Called when the server says the session has ended. */
  onSignedOut?: () => void;
  /** How long to wait for more changes before writing a record (ms). */
  writeDelayMs?: number;
  retryDelayMs?: number;
}

const MAX_TRIES = 5;

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  tries: number;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class SyncedProgressStore implements ProgressStore {
  private books = new Map<string, BookProgress>();
  private stories = new Map<string, Story>();
  /** Deleted before the server data arrived; skipped when merging it. */
  private deleted = new Set<string>();
  private pending = new Map<string, Pending>();
  private loading?: Promise<void>;
  private state: StoreStatus = "loading";
  private user?: UserData["user"];
  private readonly writeDelayMs: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly remote: RemoteApi,
    private readonly opts: SyncedStoreOptions = {},
  ) {
    this.writeDelayMs = opts.writeDelayMs ?? 1000;
    this.retryDelayMs = opts.retryDelayMs ?? 5000;
  }

  /* ── Loading ── */

  status(): StoreStatus {
    return this.state;
  }

  /** The signed-in account, once loaded. */
  account(): UserData["user"] | undefined {
    return this.user;
  }

  /** Loads the account's data (once; call again after an error to retry). */
  load(): Promise<void> {
    this.loading ??= this.remote.load().then(
      (data) => {
        this.user = data.user;
        // Anything changed locally while loading is newer than the server copy.
        for (const b of data.books) {
          const local = this.books.get(b.bookId);
          if (!this.deleted.has(`book:${b.bookId}`) && (!local || local.updatedAt < b.updatedAt))
            this.books.set(b.bookId, b);
        }
        for (const s of data.stories) {
          const local = this.stories.get(s.id);
          if (!this.deleted.has(`story:${s.id}`) && (!local || local.updatedAt < s.updatedAt))
            this.stories.set(s.id, s);
        }
        this.replayOutbox(data.user.email);
        this.state = "ready";
        this.changed();
      },
      (err) => {
        this.loading = undefined;
        if (err instanceof SignedOutError) this.opts.onSignedOut?.();
        this.state = "error";
        this.changed();
      },
    );
    return this.loading;
  }

  /** Retries loading after an error. */
  retry(): Promise<void> {
    this.state = "loading";
    this.changed();
    return this.load();
  }

  /* ── Outbox ── */

  private readOutbox(): Outbox {
    const o = this.readLocal<Outbox | null>(DEVICE_KEYS.outbox, null);
    return o && typeof o.records === "object" && o.records ? o : { records: {} };
  }

  private updateOutbox(change: (o: Outbox) => void) {
    const o = this.readOutbox();
    change(o);
    if (this.user) o.email = this.user.email;
    this.writeLocal(DEVICE_KEYS.outbox, o);
  }

  /** After loading: re-apply and re-send this account's unconfirmed changes. */
  private replayOutbox(email: string) {
    const o = this.readOutbox();
    if (o.email && o.email !== email) {
      this.writeLocal(DEVICE_KEYS.outbox, { email, records: {} });
      return;
    }
    for (const [key, r] of Object.entries(o.records)) {
      const current = r.kind === "book" ? this.books.get(r.id) : this.stories.get(r.id);
      if (this.deleted.has(key) || (current && current.updatedAt >= r.body.updatedAt)) {
        delete o.records[key];
        continue;
      }
      if (r.kind === "book") this.books.set(r.id, r.body as BookProgress);
      else this.stories.set(r.id, r.body as Story);
      this.schedule(r.kind, r.id, 0, 0);
    }
    this.writeLocal(DEVICE_KEYS.outbox, { ...o, email });
  }

  /** Forgets unconfirmed changes (on sign-out, so the next person on this device can't see them). */
  clearOutbox(): void {
    try {
      this.storage.removeItem(DEVICE_KEYS.outbox);
    } catch {
      // Inaccessible storage: nothing was kept there anyway.
    }
  }

  /* ── Writing back ── */

  private changed() {
    this.opts.onChange?.();
  }

  private key(kind: RemoteKind, id: string) {
    return `${kind}:${id}`;
  }

  private schedule(kind: RemoteKind, id: string, tries = 0, delay = this.writeDelayMs) {
    const key = this.key(kind, id);
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    this.pending.set(key, {
      timer: setTimeout(() => void this.write(kind, id), delay),
      tries: existing ? Math.min(existing.tries, tries) : tries,
    });
    const body = kind === "book" ? this.books.get(id) : this.stories.get(id);
    if (body) this.updateOutbox((o) => void (o.records[key] = { kind, id, body }));
  }

  private async write(kind: RemoteKind, id: string) {
    const key = this.key(kind, id);
    const p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    const body = kind === "book" ? this.books.get(id) : this.stories.get(id);
    if (!body) return;
    try {
      await this.remote.put(kind, id, body);
      // Confirmed: drop it from the outbox, unless a newer change has replaced it since.
      this.updateOutbox((o) => {
        const r = o.records[key];
        if (r && r.body.updatedAt <= body.updatedAt) delete o.records[key];
      });
    } catch (err) {
      if (err instanceof SignedOutError) return this.opts.onSignedOut?.();
      const retryable = !(err instanceof RemoteError) || err.retryable;
      // A newer change may already be queued; it carries the latest data anyway.
      if (retryable && p.tries + 1 < MAX_TRIES && !this.pending.has(key)) {
        this.schedule(kind, id, p.tries + 1, this.retryDelayMs * (p.tries + 1));
      } else if (!retryable) {
        // The server refused this record; resending it would fail again.
        this.updateOutbox((o) => void delete o.records[key]);
        console.error(`Couldn't save ${key}`, err);
      }
      // Out of retries (e.g. offline): it stays in the outbox for the next load.
    }
  }

  /** Sends every queued write now (e.g. when the page is being hidden or before signing out). */
  async flush(): Promise<void> {
    await Promise.all(
      [...this.pending.keys()].map((key) => {
        const [kind, ...rest] = key.split(":");
        return this.write(kind as RemoteKind, rest.join(":"));
      }),
    );
  }

  private removeRemote(kind: RemoteKind, id: string) {
    const key = this.key(kind, id);
    const p = this.pending.get(key);
    if (p) clearTimeout(p.timer);
    this.pending.delete(key);
    this.updateOutbox((o) => void delete o.records[key]);
    if (this.state !== "ready") this.deleted.add(key);
    this.remote.remove(kind, id).catch((err) => {
      if (err instanceof SignedOutError) this.opts.onSignedOut?.();
      else console.error(`Couldn't delete ${key}`, err);
    });
  }

  /* ── Device-local: anonymous session and preferences ── */

  private readLocal<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      // Corrupt or inaccessible storage should never break reading.
      return fallback;
    }
  }

  private writeLocal(key: string, value: unknown): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode: it just won't persist.
    }
  }

  getSession(): Session {
    const existing = this.readLocal<Session | null>(DEVICE_KEYS.session, null);
    if (existing?.anonId) return existing;
    const session: Session = { anonId: randomId(), createdAt: Date.now() };
    this.writeLocal(DEVICE_KEYS.session, session);
    return session;
  }

  setSessionCode(code: string | undefined): Session {
    const session = { ...this.getSession(), sessionCode: code || undefined };
    this.writeLocal(DEVICE_KEYS.session, session);
    return session;
  }

  getReaderPrefs(): ReaderPrefs {
    return {
      ...DEFAULT_READER_PREFS,
      ...this.readLocal<Partial<ReaderPrefs>>(DEVICE_KEYS.prefs, {}),
    };
  }

  saveReaderPrefs(prefs: ReaderPrefs): void {
    this.writeLocal(DEVICE_KEYS.prefs, prefs);
  }

  /* ── Account data ── */

  getBookProgress(bookId: BookId): BookProgress | undefined {
    return this.books.get(bookId);
  }

  saveBookProgress(progress: BookProgress): void {
    this.books.set(progress.bookId, progress);
    this.deleted.delete(this.key("book", progress.bookId));
    this.schedule("book", progress.bookId);
  }

  listBookProgress(): BookProgress[] {
    return [...this.books.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  clearBookProgress(bookId: BookId): void {
    this.books.delete(bookId);
    this.removeRemote("book", bookId);
  }

  getStory(id: string): Story | undefined {
    return this.stories.get(id);
  }

  saveStory(story: Story): void {
    this.stories.set(story.id, story);
    this.deleted.delete(this.key("story", story.id));
    // Stories change only at discrete moments (a new page, undo, rename), so save right away:
    // a reader who leaves straight after a new page must find it on the next screen.
    this.schedule("story", story.id, 0, 0);
  }

  listStories(): Story[] {
    return [...this.stories.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteStory(id: string): void {
    this.stories.delete(id);
    this.removeRemote("story", id);
  }
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}
