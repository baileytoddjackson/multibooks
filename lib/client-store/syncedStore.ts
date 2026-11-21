import type { BookId } from "@/lib/schemas/content";
import { DEFAULT_READER_PREFS, type ProgressStore } from "./ProgressStore";
import type { RemoteApi, RemoteKind, UserData } from "./remote";
import { RemoteError, SignedOutError } from "./remote";
import type { BookProgress, CyoStory, ReaderPrefs, Session } from "./types";

/**
 * The client store for a signed-in reader.
 *
 * - Book progress and stories belong to the account: loaded once per page from the server, kept
 *   in memory so the UI can read them synchronously, and written back shortly after each change
 *   (one coalesced write per record, flushed when the page is hidden).
 * - The anonymous analytics session and reader preferences belong to the device and stay in
 *   localStorage. The analytics id is never sent with account data, so research events can't be
 *   linked to an account.
 */
export type StoreStatus = "loading" | "ready" | "error";

const PREFIX = "multibooks:v1:";
const DEVICE_KEYS = { session: `${PREFIX}session`, prefs: `${PREFIX}prefs` } as const;

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
  private stories = new Map<string, CyoStory>();
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
          if (!this.deleted.has(`create:${s.id}`) && (!local || local.updatedAt < s.updatedAt))
            this.stories.set(s.id, s);
        }
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
  }

  private async write(kind: RemoteKind, id: string, keepalive = false) {
    const key = this.key(kind, id);
    const p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    const body = kind === "book" ? this.books.get(id) : this.stories.get(id);
    if (!body) return;
    try {
      await this.remote.put(kind, id, body, { keepalive });
    } catch (err) {
      if (err instanceof SignedOutError) return this.opts.onSignedOut?.();
      const retryable = !(err instanceof RemoteError) || err.retryable;
      // A newer change may already be queued; it carries the latest data anyway.
      if (retryable && p.tries + 1 < MAX_TRIES && !this.pending.has(key)) {
        this.schedule(kind, id, p.tries + 1, this.retryDelayMs * (p.tries + 1));
      } else if (!retryable) {
        console.error(`Couldn't save ${key}`, err);
      }
    }
  }

  /** Sends every queued write now (e.g. when the page is being hidden or before signing out). */
  async flush(keepalive = true): Promise<void> {
    await Promise.all(
      [...this.pending.keys()].map((key) => {
        const [kind, ...rest] = key.split(":");
        return this.write(kind as RemoteKind, rest.join(":"), keepalive);
      }),
    );
  }

  private removeRemote(kind: RemoteKind, id: string) {
    const key = this.key(kind, id);
    const p = this.pending.get(key);
    if (p) clearTimeout(p.timer);
    this.pending.delete(key);
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

  getStory(id: string): CyoStory | undefined {
    return this.stories.get(id);
  }

  saveStory(story: CyoStory): void {
    this.stories.set(story.id, story);
    this.deleted.delete(this.key("create", story.id));
    this.schedule("create", story.id);
  }

  listStories(): CyoStory[] {
    return [...this.stories.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteStory(id: string): void {
    this.stories.delete(id);
    this.removeRemote("create", id);
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
