import type {
  AnalyticsEvent,
  SavedKind,
  SavedRecord,
  ServerStore,
  SessionUser,
  SqlDialect,
  UsageRecord,
  UserRecord,
} from "./ServerStore";
import { utcDay } from "./ServerStore";

/**
 * Shared SQL implementation of ServerStore. The SQL is written to run unchanged on SQLite/libSQL
 * (local dev, tests) and Postgres (Supabase in production); each backend supplies a small
 * Executor and its own CREATE TABLE statements.
 */
export type SqlArg = string | number | null;

export interface Executor {
  dialect: SqlDialect;
  /** Runs one statement with `?` placeholders. */
  exec(
    sql: string,
    args?: SqlArg[],
  ): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
  /** Runs statements atomically (one transaction). */
  batch(statements: { sql: string; args: SqlArg[] }[]): Promise<void>;
}

export class SqlStore implements ServerStore {
  private ready: Promise<void>;
  readonly dialect: SqlDialect;

  constructor(
    private readonly db: Executor,
    migrations: string[],
  ) {
    this.dialect = db.dialect;
    this.ready = (async () => {
      for (const sql of migrations) await db.exec(sql);
    })();
  }

  private async exec(sql: string, args: SqlArg[] = []) {
    await this.ready;
    return this.db.exec(sql, args);
  }

  async logUsage(u: UsageRecord): Promise<void> {
    const ts = Date.now();
    const day = utcDay(ts);
    await this.ready;
    await this.db.batch([
      {
        sql: `INSERT INTO llm_usage (ts, day, session_id, kind, model, input_tokens, output_tokens,
                cache_read, cache_write, est_cost_usd, latency_ms, book_id, ok)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ts,
          day,
          u.sessionId ?? null,
          u.kind,
          u.model,
          u.inputTokens,
          u.outputTokens,
          u.cacheReadTokens,
          u.cacheWriteTokens,
          u.estCostUsd,
          u.latencyMs,
          u.bookId ?? null,
          u.ok ? 1 : 0,
        ],
      },
      {
        sql: `INSERT INTO daily_spend (day, est_cost_usd) VALUES (?, ?)
              ON CONFLICT(day) DO UPDATE SET est_cost_usd = daily_spend.est_cost_usd + excluded.est_cost_usd`,
        args: [day, u.estCostUsd],
      },
    ]);
  }

  async getDailySpend(day: string): Promise<number> {
    const r = await this.exec(`SELECT est_cost_usd FROM daily_spend WHERE day = ?`, [day]);
    return r.rows[0] ? Number(r.rows[0].est_cost_usd) : 0;
  }

  async incrementCounter(bucket: string, ttlMs: number): Promise<number> {
    const now = Date.now();
    const r = await this.exec(
      `INSERT INTO counters (bucket, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET
         count = CASE WHEN counters.expires_at < ? THEN 1 ELSE counters.count + 1 END,
         expires_at = CASE WHEN counters.expires_at < ? THEN excluded.expires_at ELSE counters.expires_at END
       RETURNING count`,
      [bucket, now + ttlMs, now, now],
    );
    return Number(r.rows[0]?.count ?? 1);
  }

  async getCounter(bucket: string): Promise<number> {
    const r = await this.exec(`SELECT count, expires_at FROM counters WHERE bucket = ?`, [bucket]);
    const row = r.rows[0];
    if (!row || Number(row.expires_at) < Date.now()) return 0;
    return Number(row.count);
  }

  async logEvents(events: AnalyticsEvent[]): Promise<void> {
    if (!events.length) return;
    await this.ready;
    await this.db.batch(
      events.map((e) => ({
        sql: `INSERT INTO events (ts, session_id, session_code, type, props_json) VALUES (?, ?, ?, ?, ?)`,
        args: [e.ts, e.sessionId, e.sessionCode ?? null, e.type, JSON.stringify(e.props)],
      })),
    );
  }

  /* ── Accounts ── */

  async createUser(u: UserRecord): Promise<boolean> {
    const r = await this.exec(
      `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
      [u.id, u.email, u.passwordHash, u.createdAt],
    );
    return r.rowsAffected === 1;
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    const r = await this.exec(
      `SELECT id, email, password_hash, created_at FROM users WHERE email = ?`,
      [email],
    );
    const row = r.rows[0];
    if (!row) return undefined;
    return {
      id: String(row.id),
      email: String(row.email),
      passwordHash: String(row.password_hash),
      createdAt: Number(row.created_at),
    };
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.exec(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
  }

  async countUsers(): Promise<number> {
    const r = await this.exec(`SELECT COUNT(*) AS n FROM users`);
    return Number(r.rows[0]?.n ?? 0);
  }

  async createSession(s: { tokenHash: string; userId: string; expiresAt: number }): Promise<void> {
    const now = Date.now();
    await this.ready;
    await this.db.batch([
      // Housekeeping: drop expired sessions whenever someone signs in.
      { sql: `DELETE FROM auth_sessions WHERE expires_at < ?`, args: [now] },
      {
        sql: `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
        args: [s.tokenHash, s.userId, s.expiresAt, now],
      },
    ]);
  }

  async getSessionUser(tokenHash: string): Promise<SessionUser | undefined> {
    const r = await this.exec(
      `SELECT u.id, u.email FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [tokenHash, Date.now()],
    );
    const row = r.rows[0];
    return row ? { id: String(row.id), email: String(row.email) } : undefined;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.exec(`DELETE FROM auth_sessions WHERE token_hash = ?`, [tokenHash]);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.exec(`DELETE FROM auth_sessions WHERE user_id = ?`, [userId]);
  }

  /* ── Saved reading and stories ── */

  async listSaved(userId: string): Promise<SavedRecord[]> {
    const r = await this.exec(
      `SELECT kind, id, book_id, title, data_json, created_at, updated_at FROM stories
       WHERE user_id = ? ORDER BY updated_at DESC`,
      [userId],
    );
    return r.rows.map((row) => ({
      kind: row.kind as SavedKind,
      id: String(row.id),
      bookId: row.book_id == null ? undefined : String(row.book_id),
      title: row.title == null ? undefined : String(row.title),
      data: JSON.parse(String(row.data_json)) as unknown,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  async putSaved(userId: string, s: SavedRecord): Promise<boolean> {
    const r = await this.exec(
      `INSERT INTO stories (user_id, kind, id, book_id, title, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, kind, id) DO UPDATE SET book_id = excluded.book_id,
         title = excluded.title, data_json = excluded.data_json, updated_at = excluded.updated_at
       WHERE stories.updated_at <= excluded.updated_at`,
      [
        userId,
        s.kind,
        s.id,
        s.bookId ?? null,
        s.title ?? null,
        JSON.stringify(s.data),
        s.createdAt,
        s.updatedAt,
      ],
    );
    return r.rowsAffected === 1;
  }

  async deleteSaved(userId: string, kind: SavedKind, id: string): Promise<void> {
    await this.exec(`DELETE FROM stories WHERE user_id = ? AND kind = ? AND id = ?`, [
      userId,
      kind,
      id,
    ]);
  }

  async query<T = Record<string, unknown>>(sql: string, args: SqlArg[] = []): Promise<T[]> {
    const r = await this.exec(sql, args);
    return r.rows as unknown as T[];
  }
}
