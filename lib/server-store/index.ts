import "server-only";
import { env } from "@/lib/env";
import { createStore } from "./create";
import type { ServerStore } from "./ServerStore";

let store: ServerStore | undefined;

/** The app-wide server store (one client per server instance). */
export function serverStore(): ServerStore {
  if (!store) {
    const { DATABASE_URL, DATABASE_AUTH_TOKEN } = env();
    store = createStore(DATABASE_URL, DATABASE_AUTH_TOKEN);
  }
  return store;
}

export type { ServerStore } from "./ServerStore";
export { utcDay } from "./ServerStore";
