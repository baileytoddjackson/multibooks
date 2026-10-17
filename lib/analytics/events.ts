import { z } from "zod";

/**
 * Anonymous research events for the library and classroom pilots. No names, no free text, no IPs:
 * every prop is an id, an enum, a number or a boolean. Add new events here so the ingest endpoint
 * accepts them and /admin/stats can rely on their shape.
 */
/** Ids, enums and codes only: lowercase letters, digits, "-" and "_". No room for free text. */
const id = z.string().regex(/^[a-z0-9_-]{1,60}$/);
const context = z.enum(["book", "cyo"]);
const style = z.enum(["direct", "character", "both"]);

export const EventSchemas = {
  book_selected: z.object({ bookId: id }),
  mode_chosen: z.object({ bookId: id, mode: z.enum(["canon", "adventure"]) }),
  style_chosen: z.object({ context, style, characterId: id.optional(), bookId: id.optional() }),
  choice_made: z.object({
    context,
    bookId: id.optional(),
    cpId: id.optional(),
    optionId: id.optional(),
    perspective: id.optional(),
    turn: z.number().int().min(0).max(500).optional(),
  }),
  detour_served: z.object({ bookId: id, cpId: id, cached: z.boolean() }),
  return_to_canon: z.object({
    bookId: id,
    cpId: id.optional(),
    from: z.enum(["choice", "detour", "menu", "resting"]),
  }),
  undo: z.object({ context, bookId: id.optional() }),
  words_read: z.object({
    context,
    bookId: id.optional(),
    words: z.number().int().min(0).max(5000),
  }),
  session_heartbeat: z.object({
    path: z.enum(["dashboard", "book", "read", "create", "story", "other"]),
  }),
  create_started: z.object({}),
  stepper_step_viewed: z.object({ step: z.number().int().min(1).max(3) }),
  stepper_step_completed: z.object({
    step: z.number().int().min(1).max(3),
    genre: id.optional(),
    usedSurprise: z.boolean().optional(),
    skipped: z.boolean().optional(),
  }),
  create_completed: z.object({ genre: id }),
  cyo_redirected: z.object({ reason: id }),
  story_finished: z.object({ genre: id, turns: z.number().int().min(1).max(500) }),
  generation_blocked: z.object({
    context,
    reason: z.enum(["daily_budget", "session_limit", "rate_limited"]),
  }),
  error_shown: z.object({ context: z.enum(["book", "cyo", "page"]), code: id }),
  feedback_clicked: z.object({}),
} satisfies Record<string, z.ZodType>;

export type EventType = keyof typeof EventSchemas;
export type EventProps<T extends EventType> = z.infer<(typeof EventSchemas)[T]>;

export const EVENT_TYPES = Object.keys(EventSchemas) as EventType[];

/** Wire format for one event in a batch POSTed to /api/events. */
export const WireEventSchema = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()),
  ts: z.number().int(),
});

export const EventBatchSchema = z.object({
  sessionId: z.string().min(8).max(64),
  sessionCode: z
    .string()
    .regex(/^[A-Z0-9-]{1,20}$/)
    .optional(),
  events: z.array(WireEventSchema).min(1).max(50),
});

/** Validates one event's props against its schema; unknown types and bad props are dropped. */
export function parseEvent(type: string, props: unknown): Record<string, unknown> | null {
  if (!(type in EventSchemas)) return null;
  const r = EventSchemas[type as EventType].safeParse(props);
  return r.success ? (r.data as Record<string, unknown>) : null;
}
