import { currentUser, unauthorized } from "@/lib/auth/session";
import { badRequest, readSavedBody } from "@/lib/auth/userData";
import { isBookId } from "@/lib/content/books";
import { BookProgressSchema } from "@/lib/schemas/userData";
import { serverStore } from "@/lib/server-store";

/** PUT /api/me/books/:bookId (BookProgress) · DELETE /api/me/books/:bookId */
export async function PUT(request: Request, ctx: RouteContext<"/api/me/books/[bookId]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { bookId } = await ctx.params;
  const progress = await readSavedBody(request, BookProgressSchema);
  if (!progress || progress.bookId !== bookId) return badRequest();

  const now = Date.now();
  await serverStore().putSaved(user.id, {
    kind: "book",
    id: bookId,
    bookId,
    data: progress,
    createdAt: now,
    // Clamp client clocks so a fast clock can't block later writes.
    updatedAt: Math.min(progress.updatedAt, now + 60_000),
  });
  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/me/books/[bookId]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { bookId } = await ctx.params;
  if (!isBookId(bookId)) return badRequest();
  await serverStore().deleteSaved(user.id, "book", bookId);
  return new Response(null, { status: 204 });
}
