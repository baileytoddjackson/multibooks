import { randomUUID } from "node:crypto";
import { z } from "zod";
import { accessCodeMatches } from "@/lib/auth/accessCode";
import {
  authError,
  EmailSchema,
  PasswordSchema,
  tooManyAuthAttempts,
  withAuthErrors,
} from "@/lib/auth/accounts";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { serverStore } from "@/lib/server-store";

/**
 * POST /api/auth/signup {email, password, accessCode} → 200 {ok} and a session cookie.
 * Open sign-up isn't allowed: the shared access code (SIGNUP_ACCESS_CODE) is checked server-side.
 */
const BodySchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  accessCode: z.string().max(100),
});

export const POST = withAuthErrors("signup", async (request) => {
  if (await tooManyAuthAttempts(request, "signup")) return authError("slow_down", 429);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return authError("bad_request", 400, parsed.error.issues[0]?.message);
  }
  const { email, password, accessCode } = parsed.data;

  const { SIGNUP_ACCESS_CODE } = env();
  if (!SIGNUP_ACCESS_CODE) return authError("signup_closed", 403);
  if (!accessCodeMatches(accessCode, SIGNUP_ACCESS_CODE)) return authError("bad_code", 403);

  const user = {
    id: randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };
  if (!(await serverStore().createUser(user))) return authError("email_taken", 409);

  const cookie = await startSession(request, user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
});
