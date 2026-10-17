import { ADMIN_COOKIE } from "@/lib/admin/auth";

/** POST /api/admin/logout → clears the admin cookie. */
export async function POST(request: Request) {
  const headers = new Headers({ Location: new URL("/admin/stats", request.url).toString() });
  headers.append(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
  return new Response(null, { status: 303, headers });
}
