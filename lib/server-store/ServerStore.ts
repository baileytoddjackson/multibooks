import type { UsageKind } from "@/lib/llm/types";

/**
 * Server-side persistence boundary: accounts and sessions, each reader's saved stories,
 * usage/cost logging, rate limiting and analytics events. Implemented with libSQL (SQLite locally, Turso on Vercel);
 * another backend only needs to implement this interface.
 */
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

/**
 * "book" = progress reading one book as written (id is the book id); "story" = a Create Your Own
 * or Adventure Mode story (book_id is set for adventures).
 */
export type SavedKind = "book" | "story";

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
