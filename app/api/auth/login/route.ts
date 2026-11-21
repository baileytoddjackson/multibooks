import { z } from "zod";
import { authError, EmailSchema, tooManyAuthAttempts } from "@/lib/auth/accounts";
import { dummyHash, PASSWORD_MAX, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { serverStore } from "@/lib/server-store";

/** POST /api/auth/login {email, password} → 200 {ok} and a session cookie, or 401. */
const BodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});

export async function POST(request: Request) {
  if (await tooManyAuthAttempts(request, "login")) return authError("slow_down", 429);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return authError("bad_credentials", 401);
  const { email, password } = parsed.data;

  const user = await serverStore().getUserByEmail(email);
  // Hash even for unknown emails so response time doesn't reveal which emails have accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) return authError("bad_credentials", 401);

  const cookie = await startSession(request, user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
