import type { BookId } from "@/lib/schemas/content";
import { DEFAULT_READER_PREFS, type ProgressStore } from "./ProgressStore";
import type { BookProgress, CyoStory, ReaderPrefs, Session } from "./types";

const PREFIX = "multibooks:v1:";
const KEYS = {
  session: `${PREFIX}session`,
  prefs: `${PREFIX}prefs`,
  books: `${PREFIX}books`,
  stories: `${PREFIX}stories`,
} as const;

/** Minimal Storage surface so tests can pass an in-memory map. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class LocalStorageProgressStore implements ProgressStore {
  constructor(private readonly storage: KeyValueStorage) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      // Corrupt or inaccessible storage should never break reading.
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode: progress just won't persist.
    }
  }

  getSession(): Session {
    const existing = this.read<Session | null>(KEYS.session, null);
    if (existing?.anonId) return existing;
    const session: Session = { anonId: randomId(), createdAt: Date.now() };
    this.write(KEYS.session, session);
    return session;
  }

  setSessionCode(code: string | undefined): Session {
    const session = { ...this.getSession(), sessionCode: code || undefined };
    this.write(KEYS.session, session);
    return session;
  }

  private books(): Record<string, BookProgress> {
    return this.read<Record<string, BookProgress>>(KEYS.books, {});
  }

  getBookProgress(bookId: BookId): BookProgress | undefined {
    return this.books()[bookId];
  }

  saveBookProgress(progress: BookProgress): void {
    this.write(KEYS.books, { ...this.books(), [progress.bookId]: progress });
  }

  listBookProgress(): BookProgress[] {
    return Object.values(this.books()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  clearBookProgress(bookId: BookId): void {
    const books = this.books();
    delete books[bookId];
    this.write(KEYS.books, books);
  }

  private stories(): Record<string, CyoStory> {
    return this.read<Record<string, CyoStory>>(KEYS.stories, {});
  }

  getStory(id: string): CyoStory | undefined {
    return this.stories()[id];
  }

  saveStory(story: CyoStory): void {
    this.write(KEYS.stories, { ...this.stories(), [story.id]: story });
  }

  listStories(): CyoStory[] {
    return Object.values(this.stories()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteStory(id: string): void {
    const stories = this.stories();
    delete stories[id];
    this.write(KEYS.stories, stories);
  }

  getReaderPrefs(): ReaderPrefs {
    return { ...DEFAULT_READER_PREFS, ...this.read<Partial<ReaderPrefs>>(KEYS.prefs, {}) };
  }

  saveReaderPrefs(prefs: ReaderPrefs): void {
    this.write(KEYS.prefs, prefs);
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
