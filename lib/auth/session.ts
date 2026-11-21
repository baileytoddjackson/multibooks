import "server-only";
import { cookies } from "next/headers";
import { serverStore } from "@/lib/server-store";
import type { SessionUser } from "@/lib/server-store/ServerStore";
import { hashToken, isHttps, randomToken } from "./crypto";
import { SESSION_COOKIE } from "./constants";

/**
 * Reader sessions: a random token in an httpOnly cookie, stored (hashed) in `auth_sessions`.
 * Proxy only checks that the cookie exists; every API route checks it against the database
 * through `currentUser()`.
 */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/** Creates a session for the user and returns the Set-Cookie header value. */
export async function startSession(request: Request, userId: string): Promise<string> {
  const token = randomToken();
  await serverStore().createSession({
    tokenHash: hashToken(token),
    userId,
    expiresAt: Date.now() + SESSION_MS,
  });
  return sessionCookie(request, token, SESSION_MS / 1000);
}

/** Set-Cookie value that removes the session cookie. */
export function clearedSessionCookie(request: Request): string {
  return sessionCookie(request, "", 0);
}

function sessionCookie(request: Request, value: string, maxAgeSec: number): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    // Lax so following an emailed or bookmarked link still arrives signed in.
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    isHttps(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** The signed-in user for this request, or undefined. */
export async function currentUser(): Promise<SessionUser | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return serverStore().getSessionUser(hashToken(token));
}

/** Ends the current session (if any) in the database. */
export async function endSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await serverStore().deleteSession(hashToken(token));
}

export function unauthorized(): Response {
  return Response.json({ error: "signed_out" }, { status: 401 });
}
