import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  createAdminToken,
  passwordMatches,
} from "@/lib/admin/auth";
import { ipHashFor } from "@/lib/budget/budget";
import { env } from "@/lib/env";
import { serverStore } from "@/lib/server-store";

/** POST (form) /api/admin/login → sets the signed admin cookie and returns to /admin/stats. */
export async function POST(request: Request) {
  const back = (query = "") => new URL(`/admin/stats${query}`, request.url);
  const { ADMIN_PASSWORD, APP_SECRET } = env();

  // At most 10 attempts per minute per (hashed) IP.
  const minute = Math.floor(Date.now() / 60_000);
  const attempts = await serverStore().incrementCounter(
    `login:${minute}:${ipHashFor(request.headers)}`,
    120_000,
  );
  if (attempts > 10) return Response.redirect(back("?error=slow"), 303);

  const form = await request.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  if (!passwordMatches(password, ADMIN_PASSWORD)) return Response.redirect(back("?error=1"), 303);

  const res = Response.redirect(back(), 303);
  const headers = new Headers(res.headers);
  headers.append(
    "Set-Cookie",
    [
      `${ADMIN_COOKIE}=${createAdminToken(APP_SECRET)}`,
      "Path=/admin",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${ADMIN_SESSION_MS / 1000}`,
      // Secure whenever the request came over HTTPS (always on Vercel; not plain-http localhost).
      new URL(request.url).protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https"
        ? "Secure"
        : "",
    ]
      .filter(Boolean)
      .join("; "),
  );
  return new Response(null, { status: 303, headers });
}
