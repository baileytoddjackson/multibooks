import { currentUser, unauthorized } from "@/lib/auth/session";
import { badRequest, readSavedBody } from "@/lib/auth/userData";
import { CyoStorySchema } from "@/lib/schemas/userData";
import { serverStore } from "@/lib/server-store";

/** PUT /api/me/stories/:storyId (CyoStory) · DELETE /api/me/stories/:storyId */
export async function PUT(request: Request, ctx: RouteContext<"/api/me/stories/[storyId]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { storyId } = await ctx.params;
  const story = await readSavedBody(request, CyoStorySchema);
  if (!story || story.id !== storyId) return badRequest();

  const now = Date.now();
  await serverStore().putSaved(user.id, {
    kind: "create",
    id: story.id,
    title: story.title,
    data: story,
    createdAt: Math.min(story.createdAt, now),
    updatedAt: Math.min(story.updatedAt, now + 60_000),
  });
  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/me/stories/[storyId]">) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { storyId } = await ctx.params;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(storyId)) return badRequest();
  await serverStore().deleteSaved(user.id, "create", storyId);
  return new Response(null, { status: 204 });
}
