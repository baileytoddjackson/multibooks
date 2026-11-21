import { clearedSessionCookie, endSession } from "@/lib/auth/session";

/** POST /api/auth/logout → ends the session and clears the cookie. */
export async function POST(request: Request) {
  await endSession();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearedSessionCookie(request) },
  });
}
