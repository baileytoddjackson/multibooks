import { createClient, type Client, type InValue } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import type {
  AnalyticsEvent,
  CachedDetour,
  DetourPayload,
  ServerStore,
  UsageRecord,
} from "./ServerStore";
import { utcDay } from "./ServerStore";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS detours (
     cache_key TEXT PRIMARY KEY,
     book_id TEXT NOT NULL,
     cp_id TEXT NOT NULL,
     option_id TEXT NOT NULL,
     perspective TEXT NOT NULL,
     payload_json TEXT NOT NULL,
     source TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS detours_book ON detours(book_id, cp_id)`,
  `CREATE TABLE IF NOT EXISTS generation_locks (
     cache_key TEXT PRIMARY KEY,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS llm_usage (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,
     day TEXT NOT NULL,
     session_id TEXT,
     kind TEXT NOT NULL,
     model TEXT NOT NULL,
     input_tokens INTEGER NOT NULL,
     output_tokens INTEGER NOT NULL,
     cache_read INTEGER NOT NULL,
     cache_write INTEGER NOT NULL,
     est_cost_usd REAL NOT NULL,
     latency_ms INTEGER NOT NULL,
     book_id TEXT,
     ok INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS llm_usage_day ON llm_usage(day)`,
  `CREATE TABLE IF NOT EXISTS daily_spend (
     day TEXT PRIMARY KEY,
     est_cost_usd REAL NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS counters (
     bucket TEXT PRIMARY KEY,
     count INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,
     session_id TEXT NOT NULL,
     session_code TEXT,
     type TEXT NOT NULL,
     props_json TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS events_type_ts ON events(type, ts)`,
  `CREATE INDEX IF NOT EXISTS events_session ON events(session_id)`,
];

type DetourRow = CachedDetour & {
  bookId: string;
  cpId: string;
  optionId: string;
  perspective: string;
};

export class LibsqlStore implements ServerStore {
  private ready: Promise<void>;

  constructor(private readonly db: Client) {
    this.ready = (async () => {
      for (const sql of MIGRATIONS) await db.execute(sql);
    })();
  }

  static fromUrl(url: string, authToken?: string): LibsqlStore {
    if (url.startsWith("file:")) {
      const file = url.slice("file:".length);
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    }
    return new LibsqlStore(createClient({ url, authToken }));
  }

  private async exec(sql: string, args: InValue[] = []) {
    await this.ready;
    return this.db.execute({ sql, args });
  }

  async getDetour(cacheKey: string): Promise<CachedDetour | undefined> {
    const r = await this.exec(
      `SELECT cache_key, payload_json, source, created_at FROM detours WHERE cache_key = ?`,
      [cacheKey],
    );
    const row = r.rows[0];
    if (!row) return undefined;
    return {
      cacheKey: String(row.cache_key),
      payload: JSON.parse(String(row.payload_json)) as DetourPayload,
      source: row.source as CachedDetour["source"],
      createdAt: Number(row.created_at),
    };
  }

  async putDetour(d: DetourRow): Promise<void> {
    await this.exec(
      `INSERT INTO detours (cache_key, book_id, cp_id, option_id, perspective, payload_json, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json,
         source = excluded.source, created_at = excluded.created_at`,
      [
        d.cacheKey,
        d.bookId,
        d.cpId,
        d.optionId,
        d.perspective,
        JSON.stringify(d.payload),
        d.source,
        d.createdAt,
      ],
    );
  }

  async listDetours(bookId?: string): Promise<DetourRow[]> {
    const r = await this.exec(
      `SELECT * FROM detours ${bookId ? "WHERE book_id = ?" : ""} ORDER BY book_id, cp_id, option_id, perspective`,
      bookId ? [bookId] : [],
    );
    return r.rows.map((row) => ({
      cacheKey: String(row.cache_key),
      bookId: String(row.book_id),
      cpId: String(row.cp_id),
      optionId: String(row.option_id),
      perspective: String(row.perspective),
      payload: JSON.parse(String(row.payload_json)) as DetourPayload,
      source: row.source as CachedDetour["source"],
      createdAt: Number(row.created_at),
    }));
  }

  async acquireLock(cacheKey: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    // Inserts a new lock, or takes over an expired one; a live lock leaves rowsAffected at 0.
    const r = await this.exec(
      `INSERT INTO generation_locks (cache_key, expires_at) VALUES (?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET expires_at = excluded.expires_at
       WHERE generation_locks.expires_at < ?`,
      [cacheKey, now + ttlMs, now],
    );
    return r.rowsAffected === 1;
  }

  async releaseLock(cacheKey: string): Promise<void> {
    await this.exec(`DELETE FROM generation_locks WHERE cache_key = ?`, [cacheKey]);
  }

  async logUsage(u: UsageRecord): Promise<void> {
    const ts = Date.now();
    const day = utcDay(ts);
    await this.ready;
    await this.db.batch(
      [
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
                ON CONFLICT(day) DO UPDATE SET est_cost_usd = est_cost_usd + excluded.est_cost_usd`,
          args: [day, u.estCostUsd],
        },
      ],
      "write",
    );
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
      "write",
    );
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    args: (string | number | null)[] = [],
  ): Promise<T[]> {
    const r = await this.exec(sql, args);
    return r.rows as unknown as T[];
  }
}
