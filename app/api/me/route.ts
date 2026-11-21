import { currentUser, unauthorized } from "@/lib/auth/session";
import type { BookProgress, Story } from "@/lib/client-store/types";
import { serverStore } from "@/lib/server-store";

/**
 * GET /api/me → {user: {email}, books: BookProgress[], stories: Story[]}
 * Everything the signed-in reader has saved, loaded once per page load by the client store.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const saved = await serverStore().listSaved(user.id);
  return Response.json(
    {
      user: { email: user.email },
      books: saved.filter((s) => s.kind === "book").map((s) => s.data as BookProgress),
      stories: saved.filter((s) => s.kind === "story").map((s) => s.data as Story),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
