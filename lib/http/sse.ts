/**
 * Server-sent events response: `run` gets a `send(event)` and the stream closes when it returns.
 *
 * If the reader leaves mid-stream (closes the tab, goes back), `send` quietly becomes a no-op.
 * Otherwise writing to the closed stream throws inside the model's streaming callback, which looks
 * like a failed generation and triggers a paid retry that nobody will read.
 */
export function sseResponse(
  run: (send: (event: Record<string, unknown>) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // the client has gone
        }
      };
      try {
        await run(send);
      } catch (err) {
        console.error("sse handler error", err);
        send({ type: "error", code: "failed" });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        }
      }
    },
    cancel() {
      open = false;
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
