import type { BookProgress, Story } from "./types";

/** Everything the signed-in reader has saved (GET /api/me). */
export interface UserData {
  user: { email: string };
  books: BookProgress[];
  stories: Story[];
}

export type RemoteKind = "book" | "story";

/** The account's saved data on the server. Injected so the store can be tested without fetch. */
export interface RemoteApi {
  load(): Promise<UserData>;
  put(kind: RemoteKind, id: string, body: unknown): Promise<void>;
  remove(kind: RemoteKind, id: string): Promise<void>;
}

/** The session ended (expired, or signed out in another tab). */
export class SignedOutError extends Error {}

/** A non-2xx response. `retryable` for server errors; 4xx means the write itself is bad. */
export class RemoteError extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`HTTP ${status}`);
  }
}

const PATHS: Record<RemoteKind, string> = { book: "/api/me/books", story: "/api/me/stories" };
/**
 * Writes use keepalive so they finish even if the reader leaves the page mid-request (a plain
 * fetch is cancelled on unload). Browsers cap keepalive bodies at 64 KB in total, so a very long
 * story is sent as a normal request instead.
 */
const KEEPALIVE_MAX = 60_000;

async function check(res: Response): Promise<Response> {
  if (res.status === 401) throw new SignedOutError();
  if (!res.ok) throw new RemoteError(res.status, res.status >= 500 || res.status === 429);
  return res;
}

export const httpRemote: RemoteApi = {
  async load() {
    const res = await check(await fetch("/api/me", { cache: "no-store" }));
    return (await res.json()) as UserData;
  },
  async put(kind, id, body) {
    const json = JSON.stringify(body);
    await check(
      await fetch(`${PATHS[kind]}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: json.length < KEEPALIVE_MAX,
      }),
    );
  },
  async remove(kind, id) {
    await check(
      await fetch(`${PATHS[kind]}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        keepalive: true,
      }),
    );
  },
};
