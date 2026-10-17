import { ipHashFor } from "@/lib/budget/budget";
import { EventBatchSchema, parseEvent } from "@/lib/analytics/events";
import { serverStore } from "@/lib/server-store";

/**
 * POST /api/events: anonymous analytics ingest. Accepts batches of up to 50 events, keeps only
 * known event types with valid props, and stores them with the anonymous session id and optional
 * group code. Never stores IPs (a hashed IP is only used to cap abuse).
 */
const MAX_BODY_BYTES = 32_000;
const EVENTS_PER_IP_PER_MINUTE = 1200;

export async function POST(request: Request) {
  // A closing tab can abort the upload mid-way; that's expected, so drop it quietly.
  const raw = await request.text().catch(() => null);
  if (raw === null) return new Response(null, { status: 400 });
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = EventBatchSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  const store = serverStore();
  const minute = Math.floor(Date.now() / 60_000);
  const count = await store.incrementCounter(`ev:${minute}:${ipHashFor(request.headers)}`, 120_000);
  if (count > EVENTS_PER_IP_PER_MINUTE) return new Response(null, { status: 429 });

  const now = Date.now();
  const events = parsed.data.events.flatMap((e) => {
    const props = parseEvent(e.type, e.props);
    if (!props) return [];
    // Clamp client clocks to a sane window around the server's.
    const ts = Math.min(Math.max(e.ts, now - 24 * 3600_000), now + 60_000);
    return [
      {
        sessionId: parsed.data.sessionId,
        sessionCode: parsed.data.sessionCode,
        type: e.type,
        props,
        ts,
      },
    ];
  });
  if (events.length) await store.logEvents(events);
  return new Response(null, { status: 204 });
}
