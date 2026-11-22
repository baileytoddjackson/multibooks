import { describe, expect, it } from "vitest";
import { sseResponse } from "@/lib/http/sse";

describe("sseResponse", () => {
  it("streams events as server-sent events", async () => {
    const res = sseResponse(async (send) => {
      send({ type: "delta", text: "Hi" });
      send({ type: "ready" });
    });
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(await res.text()).toBe(
      'data: {"type":"delta","text":"Hi"}\n\ndata: {"type":"ready"}\n\n',
    );
  });

  it("keeps going quietly when the reader leaves mid-stream (no failed generation)", async () => {
    let finished = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const res = sseResponse(async (send) => {
      send({ type: "delta", text: "first" });
      await gate; // the reader leaves while the model is still writing
      send({ type: "delta", text: "after the reader left" }); // must not throw
      send({ type: "ready" });
      finished = true;
    });
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(finished).toBe(true);
  });
});
