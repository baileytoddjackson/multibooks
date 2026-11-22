import { z } from "zod";
import { loadAdventureBook } from "@/lib/adventure/bookContext";
import { currentUser, unauthorized } from "@/lib/auth/session";
import { guardGeneration, ipHashFor, recordGeneration } from "@/lib/budget/budget";
import { loadChapter } from "@/lib/content/load";
import { choiceView } from "@/lib/engine/bookAdventure";
import { sseResponse } from "@/lib/http/sse";
import { runGeneration } from "@/lib/llm/runGeneration";
import { buildAdventureOpeningPrompt } from "@/lib/prompts/adventure";
import { generatedTextIsClean } from "@/lib/safety/moderate";
import { MAX_FACTS } from "@/lib/schemas/userData";
import { serverStore } from "@/lib/server-store";
import { cleanGeneratedText as clean } from "@/lib/text/clean";

/**
 * POST /api/adventure/start → text/event-stream
 * The first page of an Adventure Mode story: where it leaves the book's original text.
 *   {type:"delta", text} …  the page as it's written
 *   {type:"reset"}          discard streamed text (a safer retry is coming)
 *   {type:"ready", title, story, summary, facts, choices}
 *   {type:"denied", reason, retryAfterSec?} | {type:"error", code}
 *
 * Only ids come in (the book's own choice point and option), so there's no free text to check.
 */
const BodySchema = z.object({
  bookId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  optionId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  style: z.enum(["direct", "character", "both"]),
  characterId: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  sessionId: z.string().min(8).max(64),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ type: "error", code: "bad_request" }, { status: 400 });
  }
  const b = parsed.data;

  return sseResponse(async (send) => {
    const ctx = await loadAdventureBook(b.bookId);
    const chapter = ctx && (await loadChapter(ctx.book.id, ctx.entry.chapter));
    if (!ctx || !chapter) return send({ type: "error", code: "invalid" });
    const { entry: cp, cast } = ctx;
    const character = cast.find((c) => c.id === b.characterId);
    const view = choiceView(cp, b.style, b.characterId, character?.name);
    const option = view.options.find((o) => o.id === b.optionId);
    if (!option) return send({ type: "error", code: "invalid" });

    const store = serverStore();
    const allowed = await guardGeneration(store, {
      sessionId: user.id,
      ipHash: ipHashFor(request.headers),
    });
    if (!allowed.ok) {
      return send({ type: "denied", reason: allowed.reason, retryAfterSec: allowed.retryAfterSec });
    }
    await recordGeneration(store, user.id);

    const r = await runGeneration(
      buildAdventureOpeningPrompt({
        book: ctx.book,
        synopsis: ctx.summaries.synopsis,
        cast,
        chapter,
        earlierChapters:
          ctx.summaries.chapters
            .filter((s) => s.index < cp.chapter)
            .map((s) => s.summary)
            .join(" ") || undefined,
        cp,
        option,
        character: view.perspective === "narrator" ? undefined : character,
        firstBeat: ctx.outline[0],
      }),
      {
        sessionId: b.sessionId,
        bookId: ctx.book.id,
        onText: (text) => send({ type: "delta", text }),
        onReset: () => send({ type: "reset" }),
        accept: (d) =>
          d.choices.length >= 2 &&
          generatedTextIsClean(d.title, d.story, d.summary, ...d.facts, ...d.choices),
      },
    );
    if (!r) return send({ type: "error", code: "failed" });
    send({
      type: "ready",
      title: clean(r.data.title).slice(0, 80),
      story: clean(r.data.story),
      summary: clean(r.data.summary).slice(0, 1500),
      facts: r.data.facts.map(clean).filter(Boolean).slice(-MAX_FACTS),
      choices: r.data.choices.slice(0, 3).map(clean),
      perspective: view.perspective,
    });
  });
}
