import { LibsqlStore } from "./libsqlStore";
import { PostgresStore } from "./postgresStore";
import type { ServerStore } from "./ServerStore";

/** True for Postgres connection strings (e.g. Supabase's pooler URL). */
export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//i.test(url);
}

/**
 * Picks the backend from the URL: Postgres (Supabase) for postgres:// URLs, otherwise libSQL
 * (a local SQLite file, or Turso). Used by the app and the offline scripts alike.
 */
export function createStore(url: string, authToken?: string): ServerStore {
  return isPostgresUrl(url) ? PostgresStore.fromUrl(url) : LibsqlStore.fromUrl(url, authToken);
}
