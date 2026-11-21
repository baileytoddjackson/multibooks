import type { UsageKind } from "@/lib/llm/types";

/**
 * Server-side persistence boundary: accounts and sessions, each reader's saved stories, shared
 * detour cache, generation locks, usage/cost logging, rate limiting and analytics events. Implemented with libSQL (SQLite locally, Turso on Vercel);
 * another backend only needs to implement this interface.
 */
export interface CachedDetour {
  cacheKey: string;
  payload: DetourPayload;
  source: "generated" | "prewarm" | "approved";
  createdAt: number;
}

/** What readers get for a detour: 1-2 short segments in the author's voice. */
export interface DetourPayload {
  segments: string[];
  /** Note shown when the chosen character isn't in this scene and the narrator tells it instead. */
  narratorFallbackNote?: string;
}

export interface UsageRecord {
  sessionId?: string;
  kind: UsageKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estCostUsd: number;
  latencyMs: number;
  bookId?: string;
  ok: boolean;
}

export interface AnalyticsEvent {
  sessionId: string;
  sessionCode?: string;
  type: string;
  props: Record<string, unknown>;
  ts: number;
}

export interface UserRecord {
  id: string;
  /** Stored lower-cased and trimmed. */
  email: string;
  passwordHash: string;
  createdAt: number;
}

/** What a valid session cookie resolves to. */
export interface SessionUser {
  id: string;
  email: string;
}

/** "book" = progress through one book (id is the book id); "create" = a Create Your Own story. */
export type SavedKind = "book" | "create";

/** One reader's saved reading or story, stored as JSON alongside a few columns for listing. */
export interface SavedRecord {
  kind: SavedKind;
  id: string;
  bookId?: string;
  title?: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

export type SqlDialect = "sqlite" | "postgres";

export interface ServerStore {
  /** Which SQL dialect `query` speaks (the admin stats SQL adapts to it). */
  readonly dialect: SqlDialect;

  getDetour(cacheKey: string): Promise<CachedDetour | undefined>;
  putDetour(
    d: CachedDetour & { bookId: string; cpId: string; optionId: string; perspective: string },
  ): Promise<void>;
  listDetours(
    bookId?: string,
  ): Promise<
    (CachedDetour & { bookId: string; cpId: string; optionId: string; perspective: string })[]
  >;

  deleteDetour(cacheKey: string): Promise<void>;

  /** Returns true if this caller now holds the lock (no one else is generating this key). */
  acquireLock(cacheKey: string, ttlMs: number): Promise<boolean>;
  releaseLock(cacheKey: string): Promise<void>;

  logUsage(u: UsageRecord): Promise<void>;
  /** Estimated spend so far for a UTC day ("YYYY-MM-DD"). */
  getDailySpend(day: string): Promise<number>;

  /** Increments a counter bucket and returns its new value. Buckets expire after `ttlMs`. */
  incrementCounter(bucket: string, ttlMs: number): Promise<number>;
  getCounter(bucket: string): Promise<number>;

  logEvents(events: AnalyticsEvent[]): Promise<void>;

  /* ── Accounts ── */

  /** Returns false (and changes nothing) if the email is already registered. */
  createUser(u: UserRecord): Promise<boolean>;
  getUserByEmail(email: string): Promise<UserRecord | undefined>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  countUsers(): Promise<number>;

  createSession(s: { tokenHash: string; userId: string; expiresAt: number }): Promise<void>;
  /** The signed-in user for a session token hash, if the session exists and hasn't expired. */
  getSessionUser(tokenHash: string): Promise<SessionUser | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  /* ── Saved reading and stories (per user) ── */

  listSaved(userId: string): Promise<SavedRecord[]>;
  /**
   * Inserts or replaces a record. A write older than what's stored (by `updatedAt`) is ignored,
   * so a late, slow request can't undo newer progress. Returns whether it was applied.
   */
  putSaved(userId: string, r: SavedRecord): Promise<boolean>;
  deleteSaved(userId: string, kind: SavedKind, id: string): Promise<void>;

  /** Raw SQL access for the admin stats page (read-only queries). */
  query<T = Record<string, unknown>>(sql: string, args?: (string | number | null)[]): Promise<T[]>;
}

export function utcDay(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}
