import "server-only";
import type { z } from "zod";
import { MAX_SAVED_BYTES } from "@/lib/schemas/userData";

/** Reads and validates a JSON body for /api/me writes; returns undefined on anything invalid. */
export async function readSavedBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  const raw = await request.text().catch(() => null);
  if (raw === null || raw.length > MAX_SAVED_BYTES) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function badRequest(): Response {
  return Response.json({ error: "bad_request" }, { status: 400 });
}
