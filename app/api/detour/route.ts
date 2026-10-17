import { z } from "zod";
import { getDetour } from "@/lib/engine/detourService";

/**
 * POST /api/detour → text/event-stream
 *
 * Events (each `data:` line is JSON):
 *   {type:"delta", text}                  new text as it's written (fresh generations only)
 *   {type:"ready", segments, cached, ...} the finished detour (always sent on success)
 *   {type:"pending"}                      another reader is generating this exact detour; retry soon
 *   {type:"denied", reason}               budget/session cap reached ("the story machine is resting")
 *   {type:"error", code}                  generation failed; offer "return to the original story"
 *
 * There is no free text in book adventures, so the request is just ids; every response is cacheable.
 */
const BodySchema = z.object({
  bookId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  cpId: z.string().regex(/^cp\d{2}$/),
  optionId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  perspective: z.string().regex(/^[a-z0-9-]{1,40}$/),
  sessionId: z.string().min(8).max(64),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ type: "error", code: "bad_request" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const outcome = await getDetour(parsed.data, (text) => send({ type: "delta", text }));
        switch (outcome.status) {
          case "ready":
            send({
              type: "ready",
              segments: outcome.payload.segments,
              cached: outcome.cached,
              source: outcome.source,
            });
            break;
          case "pending":
            send({ type: "pending" });
            break;
          case "denied":
            send({ type: "denied", reason: outcome.reason });
            break;
          case "invalid":
            send({ type: "error", code: "invalid" });
            break;
          case "failed":
            send({ type: "error", code: "failed" });
            break;
        }
      } catch (err) {
        console.error("detour route error", err);
        send({ type: "error", code: "failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
