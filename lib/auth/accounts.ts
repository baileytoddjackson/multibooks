import "server-only";
import { z } from "zod";
import { ipHashFor } from "@/lib/budget/budget";
import { env } from "@/lib/env";
import { serverStore } from "@/lib/server-store";
import { PASSWORD_MAX, PASSWORD_MIN } from "./password";

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Enter a valid email address." }));

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, "That password is too long.");

/**
 * True when this caller has made too many sign-in/sign-up attempts in the last minute (per
 * hashed, daily-rotating IP; AUTH_ATTEMPTS_PER_MINUTE).
 */
export async function tooManyAuthAttempts(request: Request, kind: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  const n = await serverStore().incrementCounter(
    `auth:${kind}:${minute}:${ipHashFor(request.headers)}`,
    120_000,
  );
  return n > env().AUTH_ATTEMPTS_PER_MINUTE;
}

export type AuthError =
  | "unavailable"
  | "bad_request"
  | "bad_code"
  | "signup_closed"
  | "email_taken"
  | "bad_credentials"
  | "slow_down";

export function authError(error: AuthError, status: number, message?: string): Response {
  return Response.json({ error, message }, { status });
}

/**
 * Wraps an auth route so an unexpected failure (usually the database being unreachable) is
 * logged for the server logs and answered with a clear 503, instead of a bare 500. Never logs
 * the request body (it holds the password).
 */
export function withAuthErrors(
  name: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      console.error(`[auth] ${name} failed:`, err instanceof Error ? err.message : err);
      return authError("unavailable", 503);
    }
  };
}
