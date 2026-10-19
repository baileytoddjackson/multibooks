import { createClient, type Client, type InValue } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { SqlStore, type Executor } from "./sqlStore";

/** SQLite / libSQL backend: a local file for development and tests (or a Turso URL). */
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

function libsqlExecutor(db: Client): Executor {
  return {
    dialect: "sqlite",
    async exec(sql, args = []) {
      const r = await db.execute({ sql, args: args as InValue[] });
      return { rows: r.rows as unknown as Record<string, unknown>[], rowsAffected: r.rowsAffected };
    },
    async batch(statements) {
      await db.batch(
        statements.map((s) => ({ sql: s.sql, args: s.args as InValue[] })),
        "write",
      );
    },
  };
}

export class LibsqlStore extends SqlStore {
  constructor(db: Client) {
    super(libsqlExecutor(db), MIGRATIONS);
  }

  static fromUrl(url: string, authToken?: string): LibsqlStore {
    if (url.startsWith("file:")) {
      const file = url.slice("file:".length);
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    }
    return new LibsqlStore(createClient({ url, authToken }));
  }
}
