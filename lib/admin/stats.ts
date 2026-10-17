import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { ServerStore } from "@/lib/server-store/ServerStore";

/** Filters for /admin/stats: a time window and an optional group code. */
export interface StatsFilter {
  fromMs: number;
  toMs: number;
  sessionCode?: string;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** WHERE clause + args for the events table. */
function eventWhere(f: StatsFilter, extra = "") {
  const parts = ["ts >= ?", "ts < ?"];
  const args: (string | number)[] = [f.fromMs, f.toMs];
  if (f.sessionCode) {
    parts.push("session_code = ?");
    args.push(f.sessionCode);
  }
  if (extra) parts.push(extra);
  return { sql: parts.join(" AND "), args };
}

/** WHERE clause for llm_usage; a group code filter matches sessions seen with that code. */
function usageWhere(f: StatsFilter) {
  const parts = ["ts >= ?", "ts < ?"];
  const args: (string | number)[] = [f.fromMs, f.toMs];
  if (f.sessionCode) {
    parts.push("session_id IN (SELECT DISTINCT session_id FROM events WHERE session_code = ?)");
    args.push(f.sessionCode);
  }
  return { sql: parts.join(" AND "), args };
}

export interface Breakdown {
  label: string;
  value: number;
}

export interface Stats {
  sessions: number;
  avgActiveMinutes: number;
  totalWords: number;
  avgWordsPerSession: number;
  choices: { book: number; cyo: number };
  detours: { served: number; cached: number; hitRate: number };
  returnsToCanon: Breakdown[];
  undos: number;
  books: Breakdown[];
  modes: Breakdown[];
  styles: Breakdown[];
  funnel: Breakdown[];
  genres: Breakdown[];
  surpriseUseRate: number;
  redirects: Breakdown[];
  blocked: Breakdown[];
  errors: Breakdown[];
  feedbackClicks: number;
  codes: { code: string; sessions: number; words: number }[];
  usageByKind: {
    kind: string;
    calls: number;
    failed: number;
    input: number;
    output: number;
    cost: number;
    avgLatencyMs: number;
  }[];
  usageByDay: { day: string; calls: number; cost: number }[];
  usageByBook: { book: string; calls: number; cost: number }[];
  totalCost: number;
  costPerSession: number;
  todaySpend: number;
  offline?: { runs: number; cost: number };
}

export async function getStats(store: ServerStore, f: StatsFilter, today: string): Promise<Stats> {
  const q = (sql: string, args: (string | number)[]) => store.query<Row>(sql, args);
  const ev = (extra = "") => eventWhere(f, extra);
  const groupCount = async (type: string, field: string): Promise<Breakdown[]> => {
    const w = ev("type = ?");
    const rows = await q(
      `SELECT json_extract(props_json, '$.${field}') AS label, COUNT(*) AS value FROM events
       WHERE ${w.sql} GROUP BY label ORDER BY value DESC`,
      [...w.args, type],
    );
    return rows.map((r) => ({ label: String(r.label ?? "(none)"), value: num(r.value) }));
  };
  const countOf = async (type: string) => {
    const w = ev("type = ?");
    const [r] = await q(`SELECT COUNT(*) AS n FROM events WHERE ${w.sql}`, [...w.args, type]);
    return num(r?.n);
  };
  const distinctSessions = async (extra: string, args: (string | number)[] = []) => {
    const w = ev(extra);
    const [r] = await q(`SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE ${w.sql}`, [
      ...w.args,
      ...args,
    ]);
    return num(r?.n);
  };

  const all = ev();
  const [sessionsRow] = await q(
    `SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE ${all.sql}`,
    all.args,
  );
  const sessions = num(sessionsRow?.n);

  const hb = ev("type = 'session_heartbeat'");
  const [beats] = await q(`SELECT COUNT(*) AS n FROM events WHERE ${hb.sql}`, hb.args);
  const wr = ev("type = 'words_read'");
  const [words] = await q(
    `SELECT SUM(json_extract(props_json, '$.words')) AS n FROM events WHERE ${wr.sql}`,
    wr.args,
  );

  const ch = ev("type = 'choice_made'");
  const choiceRows = await q(
    `SELECT json_extract(props_json, '$.context') AS c, COUNT(*) AS n FROM events WHERE ${ch.sql} GROUP BY c`,
    ch.args,
  );
  const choices = { book: 0, cyo: 0 };
  for (const r of choiceRows) if (r.c === "book" || r.c === "cyo") choices[r.c] = num(r.n);

  const ds = ev("type = 'detour_served'");
  const [det] = await q(
    `SELECT COUNT(*) AS served, SUM(CASE WHEN json_extract(props_json, '$.cached') THEN 1 ELSE 0 END) AS cached
     FROM events WHERE ${ds.sql}`,
    ds.args,
  );
  const served = num(det?.served);
  const cached = num(det?.cached);

  const funnel: Breakdown[] = [
    { label: "Opened the stepper", value: await distinctSessions("type = 'create_started'") },
    {
      label: "Saw step 2 (setting)",
      value: await distinctSessions(
        "type = 'stepper_step_viewed' AND json_extract(props_json, '$.step') = 2",
      ),
    },
    {
      label: "Saw step 3 (details)",
      value: await distinctSessions(
        "type = 'stepper_step_viewed' AND json_extract(props_json, '$.step') = 3",
      ),
    },
    { label: "Story created", value: await distinctSessions("type = 'create_completed'") },
    { label: "Story finished", value: await distinctSessions("type = 'story_finished'") },
  ];

  const step2 = ev("type = 'stepper_step_completed' AND json_extract(props_json, '$.step') = 2");
  const [surprise] = await q(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN json_extract(props_json, '$.usedSurprise') THEN 1 ELSE 0 END) AS s
     FROM events WHERE ${step2.sql}`,
    step2.args,
  );

  const step1 = ev("type = 'stepper_step_completed' AND json_extract(props_json, '$.step') = 1");
  const genres = (
    await q(
      `SELECT json_extract(props_json, '$.genre') AS label, COUNT(*) AS value FROM events
       WHERE ${step1.sql} GROUP BY label ORDER BY value DESC`,
      step1.args,
    )
  ).map((r) => ({ label: String(r.label ?? "(none)"), value: num(r.value) }));

  const codeW = eventWhere({ ...f, sessionCode: undefined }, "session_code IS NOT NULL");
  const codes = (
    await q(
      `SELECT session_code AS code, COUNT(DISTINCT session_id) AS sessions,
         SUM(CASE WHEN type = 'words_read' THEN json_extract(props_json, '$.words') ELSE 0 END) AS words
       FROM events WHERE ${codeW.sql} GROUP BY session_code ORDER BY sessions DESC`,
      codeW.args,
    )
  ).map((r) => ({ code: String(r.code), sessions: num(r.sessions), words: num(r.words) }));

  const uw = usageWhere(f);
  const usageByKind = (
    await q(
      `SELECT kind, COUNT(*) AS calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
         SUM(input_tokens + cache_read + cache_write) AS input, SUM(output_tokens) AS output,
         SUM(est_cost_usd) AS cost, AVG(latency_ms) AS lat
       FROM llm_usage WHERE ${uw.sql} GROUP BY kind ORDER BY cost DESC`,
      uw.args,
    )
  ).map((r) => ({
    kind: String(r.kind),
    calls: num(r.calls),
    failed: num(r.failed),
    input: num(r.input),
    output: num(r.output),
    cost: num(r.cost),
    avgLatencyMs: Math.round(num(r.lat)),
  }));
  const usageByDay = (
    await q(
      `SELECT day, COUNT(*) AS calls, SUM(est_cost_usd) AS cost FROM llm_usage WHERE ${uw.sql}
       GROUP BY day ORDER BY day DESC LIMIT 31`,
      uw.args,
    )
  ).map((r) => ({ day: String(r.day), calls: num(r.calls), cost: num(r.cost) }));
  const usageByBook = (
    await q(
      `SELECT COALESCE(book_id, '(create your own)') AS book, COUNT(*) AS calls, SUM(est_cost_usd) AS cost
       FROM llm_usage WHERE ${uw.sql} GROUP BY book ORDER BY cost DESC`,
      uw.args,
    )
  ).map((r) => ({ book: String(r.book), calls: num(r.calls), cost: num(r.cost) }));
  const [usageSessions] = await q(
    `SELECT COUNT(DISTINCT session_id) AS n FROM llm_usage WHERE ${uw.sql} AND session_id IS NOT NULL`,
    uw.args,
  );
  const totalCost = usageByKind.reduce((n, k) => n + k.cost, 0);

  return {
    sessions,
    avgActiveMinutes: sessions ? (num(beats?.n) * 0.5) / sessions : 0,
    totalWords: num(words?.n),
    avgWordsPerSession: sessions ? num(words?.n) / sessions : 0,
    choices,
    detours: { served, cached, hitRate: served ? cached / served : 0 },
    returnsToCanon: await groupCount("return_to_canon", "from"),
    undos: await countOf("undo"),
    books: await groupCount("book_selected", "bookId"),
    modes: await groupCount("mode_chosen", "mode"),
    styles: await groupCount("style_chosen", "style"),
    funnel,
    genres,
    surpriseUseRate: num(surprise?.n) ? num(surprise?.s) / num(surprise?.n) : 0,
    redirects: await groupCount("cyo_redirected", "reason"),
    blocked: await groupCount("generation_blocked", "reason"),
    errors: await groupCount("error_shown", "code"),
    feedbackClicks: await countOf("feedback_clicked"),
    codes,
    usageByKind,
    usageByDay,
    usageByBook,
    totalCost,
    costPerSession: num(usageSessions?.n) ? totalCost / num(usageSessions?.n) : 0,
    todaySpend: await store.getDailySpend(today),
    offline: await offlineUsage(),
  };
}

/** One-time content-script spend, from data/offline-usage.jsonl (present locally, not on Vercel). */
async function offlineUsage(): Promise<Stats["offline"]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data/offline-usage.jsonl"), "utf8");
    const lines = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { estCostUsd: number });
    return { runs: lines.length, cost: lines.reduce((n, l) => n + (l.estCostUsd ?? 0), 0) };
  } catch {
    return undefined;
  }
}

/** Time window for a range key ("1", "7", "30" days or "all"), ending now. */
export function statsWindow(range: string): { fromMs: number; toMs: number } {
  const now = Date.now();
  return { fromMs: range === "all" ? 0 : now - Number(range) * 24 * 3600_000, toMs: now + 1 };
}

/** Every group code ever used (for the filter dropdown). */
export async function listGroupCodes(store: ServerStore): Promise<string[]> {
  const rows = await store.query<Row>(
    "SELECT DISTINCT session_code AS code FROM events WHERE session_code IS NOT NULL ORDER BY code",
  );
  return rows.map((r) => String(r.code));
}
