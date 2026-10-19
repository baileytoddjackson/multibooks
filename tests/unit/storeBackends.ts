import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { LibsqlStore } from "@/lib/server-store/libsqlStore";
import { PostgresStore, type PgLikeClient } from "@/lib/server-store/postgresStore";
import type { ServerStore } from "@/lib/server-store/ServerStore";

/** Each backend the app supports, with a fresh empty database per call. */
export const BACKENDS: {
  name: string;
  make: () => Promise<{ store: ServerStore; cleanup: () => Promise<void> }>;
}[] = [
  {
    name: "sqlite (libSQL)",
    make: async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multibooks-store-"));
      return {
        store: LibsqlStore.fromUrl(`file:${path.join(dir, "test.db")}`),
        cleanup: async () => fs.rmSync(dir, { recursive: true, force: true }),
      };
    },
  },
  {
    name: "postgres (PGlite)",
    make: async () => {
      const db = new PGlite();
      const client: PgLikeClient = {
        async query(sql, args) {
          const r = await db.query<Record<string, unknown>>(sql, args);
          return { rows: r.rows, rowsAffected: r.affectedRows ?? 0 };
        },
        async transaction(fn) {
          await db.transaction(async (tx) => {
            await fn((sql, args) => tx.query(sql, args));
          });
        },
      };
      return { store: new PostgresStore(client), cleanup: () => db.close() };
    },
  },
];
