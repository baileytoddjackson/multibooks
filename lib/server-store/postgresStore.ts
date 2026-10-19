import postgres from "postgres";
import { SqlStore, type Executor, type SqlArg } from "./sqlStore";

/**
 * Postgres backend (Supabase in production).
 *
 * Tables live in the public schema with Row Level Security enabled and no policies, so
 * Supabase's auto-generated REST/GraphQL APIs (anon and authenticated keys) can't read or write
 * them. The app connects directly as the database owner, which RLS doesn't restrict.
 */
const TABLES = ["detours", "generation_locks", "llm_usage", "daily_spend", "counters", "events"];

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS detours (
     cache_key TEXT PRIMARY KEY,
     book_id TEXT NOT NULL,
     cp_id TEXT NOT NULL,
     option_id TEXT NOT NULL,
     perspective TEXT NOT NULL,
     payload_json TEXT NOT NULL,
     source TEXT NOT NULL,
     created_at BIGINT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS detours_book ON detours(book_id, cp_id)`,
  `CREATE TABLE IF NOT EXISTS generation_locks (
     cache_key TEXT PRIMARY KEY,
     expires_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS llm_usage (
     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     ts BIGINT NOT NULL,
     day TEXT NOT NULL,
     session_id TEXT,
     kind TEXT NOT NULL,
     model TEXT NOT NULL,
     input_tokens INTEGER NOT NULL,
     output_tokens INTEGER NOT NULL,
     cache_read INTEGER NOT NULL,
     cache_write INTEGER NOT NULL,
     est_cost_usd DOUBLE PRECISION NOT NULL,
     latency_ms INTEGER NOT NULL,
     book_id TEXT,
     ok INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS llm_usage_day ON llm_usage(day)`,
  `CREATE INDEX IF NOT EXISTS llm_usage_ts ON llm_usage(ts)`,
  `CREATE TABLE IF NOT EXISTS daily_spend (
     day TEXT PRIMARY KEY,
     est_cost_usd DOUBLE PRECISION NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS counters (
     bucket TEXT PRIMARY KEY,
     count INTEGER NOT NULL,
     expires_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     ts BIGINT NOT NULL,
     session_id TEXT NOT NULL,
     session_code TEXT,
     type TEXT NOT NULL,
     props_json TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS events_type_ts ON events(type, ts)`,
  `CREATE INDEX IF NOT EXISTS events_session ON events(session_id)`,
  // Keep Supabase's public APIs out: RLS on, no policies.
  ...TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`),
];

/** "a = ? AND b = ?" → "a = $1 AND b = $2" (our SQL never has "?" inside string literals). */
export function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Minimal client surface shared by postgres.js and PGlite (used in tests). */
export interface PgLikeClient {
  query(
    sql: string,
    args: SqlArg[],
  ): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
  transaction(
    fn: (q: (sql: string, args: SqlArg[]) => Promise<unknown>) => Promise<void>,
  ): Promise<void>;
}

function pgExecutor(client: PgLikeClient): Executor {
  return {
    dialect: "postgres",
    exec: (sql, args = []) => client.query(toPositional(sql), args),
    batch: (statements) =>
      client.transaction(async (q) => {
        for (const s of statements) await q(toPositional(s.sql), s.args);
      }),
  };
}

/** postgres.js client tuned for serverless + Supabase's transaction pooler (port 6543). */
function postgresJsClient(url: string): PgLikeClient {
  const sql = postgres(url, {
    prepare: false, // required by the transaction pooler
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    onnotice: () => undefined,
  });
  return {
    async query(text, args) {
      const r = await sql.unsafe(text, args as postgres.ParameterOrJSON<never>[]);
      return { rows: r as unknown as Record<string, unknown>[], rowsAffected: r.count };
    },
    async transaction(fn) {
      await sql.begin(async (tx) => {
        await fn((text, args) => tx.unsafe(text, args as postgres.ParameterOrJSON<never>[]));
      });
    },
  };
}

export class PostgresStore extends SqlStore {
  constructor(client: PgLikeClient) {
    super(pgExecutor(client), MIGRATIONS);
  }

  static fromUrl(url: string): PostgresStore {
    return new PostgresStore(postgresJsClient(url));
  }
}
