import { z } from "zod";
import { guardGeneration, ipHashFor, recordGeneration } from "@/lib/budget/budget";
import { DETAILS_MAX, GENRES, SETTING_MAX, suggestions, type GenreId } from "@/lib/cyo/genres";
import { sseResponse } from "@/lib/http/sse";
import { runGeneration } from "@/lib/llm/runGeneration";
import { buildCyoOpeningPrompt } from "@/lib/prompts/cyoOpening";
import { generatedTextIsClean, moderateStoryIdea } from "@/lib/safety/moderate";
import { serverStore } from "@/lib/server-store";
import { cleanGeneratedText as clean } from "@/lib/text/clean";

/**
 * POST /api/cyo/start → text/event-stream
 *   {type:"redirect", reason, suggestions}  the idea needs a gentle redirect (never a scary error)
 *   {type:"delta", text} …                  the opening as it's written
 *   {type:"reset"}                          discard streamed text (a safer retry is coming)
 *   {type:"ready", title, story, summary, cast, choices}
 *   {type:"denied", reason} | {type:"error", code}
 */
const BodySchema = z.object({
  genre: z.enum(GENRES.map((g) => g.id) as [GenreId, ...GenreId[]]),
  // Server-side limits mirror the client's (plus slack for whitespace).
  setting: z
    .string()
    .trim()
    .min(3)
    .max(SETTING_MAX + 20),
  details: z
    .string()
    .trim()
    .max(DETAILS_MAX + 20)
    .optional(),
  sessionId: z.string().min(8).max(64),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ type: "error", code: "bad_request" }, { status: 400 });
  const { genre, setting, details, sessionId } = parsed.data;

  return sseResponse(async (send) => {
    // Budget and rate limits first: moderation is itself a paid call.
    const store = serverStore();
    const allowed = await guardGeneration(store, { sessionId, ipHash: ipHashFor(request.headers) });
    if (!allowed.ok) {
      send({ type: "denied", reason: allowed.reason, retryAfterSec: allowed.retryAfterSec });
      return;
    }

    const mod = await moderateStoryIdea(
      { setting, details },
      { sessionId, maxLengths: { setting: SETTING_MAX, details: DETAILS_MAX } },
    );
    if (!mod.ok) {
      if (mod.reason === "unavailable") send({ type: "error", code: "moderation_unavailable" });
      else send({ type: "redirect", reason: mod.reason, suggestions: suggestions(genre) });
      return;
    }
    await recordGeneration(store, sessionId);

    const r = await runGeneration(buildCyoOpeningPrompt({ genre, setting, details }), {
      sessionId,
      onText: (text) => send({ type: "delta", text }),
      onReset: () => send({ type: "reset" }),
      accept: (d) =>
        d.choices.length >= 2 &&
        generatedTextIsClean(
          d.title,
          d.story,
          d.summary,
          ...d.choices,
          ...d.cast.map((c) => c.name + " " + c.oneLine),
        ),
    });
    if (!r) {
      send({ type: "error", code: "failed" });
      return;
    }
    send({
      type: "ready",
      title: clean(r.data.title).slice(0, 80),
      story: clean(r.data.story),
      summary: clean(r.data.summary),
      cast: r.data.cast
        .slice(0, 3)
        .map((c) => ({ name: clean(c.name), oneLine: clean(c.oneLine) })),
      choices: r.data.choices.slice(0, 3).map(clean),
    });
  });
}
