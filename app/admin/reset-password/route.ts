import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin/auth";
import { EmailSchema, PasswordSchema } from "@/lib/auth/accounts";
import { hashPassword } from "@/lib/auth/password";
import { env } from "@/lib/env";
import { serverStore } from "@/lib/server-store";

/**
 * POST (form) /admin/reset-password {email, password} → sets a reader's password and signs
 * them out everywhere. Lives under /admin so the admin cookie (Path=/admin) is sent with it.
 */
export async function POST(request: Request) {
  const back = (result: string) =>
    Response.redirect(new URL(`/admin/stats?reset=${result}`, request.url), 303);

  const cookie = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  if (!verifyAdminToken(cookie, env().APP_SECRET)) {
    return Response.redirect(new URL("/admin/stats", request.url), 303);
  }

  const form = await request.formData().catch(() => null);
  const email = EmailSchema.safeParse(form?.get("email"));
  const password = PasswordSchema.safeParse(form?.get("password"));
  if (!password.success) return back("weak");
  if (!email.success) return back("missing");

  const store = serverStore();
  const user = await store.getUserByEmail(email.data);
  if (!user) return back("missing");
  await store.setPasswordHash(user.id, await hashPassword(password.data));
  await store.deleteUserSessions(user.id);
  return back("ok");
}
