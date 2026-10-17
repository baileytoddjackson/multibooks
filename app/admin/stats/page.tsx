import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarList, DataTable, Meter, Panel, StatTile } from "@/components/admin/StatsParts";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin/auth";
import { getStats, listGroupCodes, statsWindow } from "@/lib/admin/stats";
import { getBook } from "@/lib/content/books";
import { genreLabel } from "@/lib/cyo/genres";
import { env } from "@/lib/env";
import { serverStore, utcDay } from "@/lib/server-store";

export const metadata: Metadata = { title: "Pilot stats", robots: { index: false, follow: false } };

const RANGES = {
  "1": "Last 24 hours",
  "7": "Last 7 days",
  "30": "Last 30 days",
  all: "All time",
} as const;
type RangeKey = keyof typeof RANGES;

const LABELS: Record<string, string> = {
  canon: "Read as written",
  adventure: "Adventure",
  direct: "Direct the story",
  character: "Be a character",
  both: "Both",
  choice: "At a choice",
  detour: "From a detour",
  resting: "When generation was resting",
  menu: "From the menu",
  daily_budget: "Daily budget reached",
  session_limit: "Device limit reached",
  rate_limited: "Rate limited",
  personal_info: "Personal info",
  blocked: "Blocked words",
  model_flagged: "Flagged by moderation",
  too_long: "Too long",
};
const label = (s: string) => getBook(s)?.shortTitle ?? LABELS[s] ?? genreLabel(s);
const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(4)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const int = (n: number) => Math.round(n).toLocaleString();

export default function StatsPage(props: PageProps<"/admin/stats">) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
      <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
        <Gate searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Gate({ searchParams }: { searchParams: PageProps<"/admin/stats">["searchParams"] }) {
  // Always rendered per request: stats depend on the current time and the admin cookie.
  await connection();
  const sp = await searchParams;
  const e = env();
  if (!e.ADMIN_PASSWORD) {
    return (
      <p className="rounded-2xl bg-card p-6 ring-1 ring-line">
        Admin is turned off. Set <code>ADMIN_PASSWORD</code> (and a long random{" "}
        <code>APP_SECRET</code>) to enable it.
      </p>
    );
  }
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!verifyAdminToken(token, e.APP_SECRET)) {
    const error =
      sp.error === "slow"
        ? "Too many tries. Wait a minute."
        : sp.error
          ? "That password didn't match."
          : "";
    return (
      <form
        method="post"
        action="/api/admin/login"
        className="mx-auto mt-16 flex max-w-sm flex-col gap-3 rounded-2xl bg-card p-6 ring-1 ring-line"
      >
        <h1 className="font-display text-2xl font-semibold">Pilot stats</h1>
        <label htmlFor="password" className="font-semibold">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="min-h-12 rounded-xl border-2 border-line bg-paper px-3"
        />
        {error && (
          <p role="alert" className="text-sm text-coral-strong">
            {error}
          </p>
        )}
        <button type="submit" className="min-h-12 rounded-full bg-ink font-semibold text-paper">
          Sign in
        </button>
      </form>
    );
  }

  const range = (typeof sp.range === "string" && sp.range in RANGES ? sp.range : "7") as RangeKey;
  const code =
    typeof sp.code === "string" && /^[A-Z0-9-]{1,20}$/.test(sp.code) ? sp.code : undefined;
  const window = statsWindow(range);
  const store = serverStore();
  const s = await getStats(store, { ...window, sessionCode: code }, utcDay());
  const allCodes = await listGroupCodes(store);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Pilot stats</h1>
          <p className="text-ink-soft">
            {RANGES[range]}
            {code ? ` · group ${code}` : " · all groups"} · anonymous, no personal data
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-sm font-semibold">
              Time range
              <select
                name="range"
                defaultValue={range}
                className="mt-1 min-h-11 rounded-xl border-2 border-line bg-card px-3"
              >
                {Object.entries(RANGES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm font-semibold">
              Group code
              <select
                name="code"
                defaultValue={code ?? ""}
                className="mt-1 min-h-11 rounded-xl border-2 border-line bg-card px-3"
              >
                <option value="">All groups</option>
                {allCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-full bg-ink px-5 font-semibold text-paper"
            >
              Apply
            </button>
          </form>
          <form method="post" action="/api/admin/logout">
            <button
              type="submit"
              className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-line"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {e.APP_SECRET === "dev-only-secret" && (
        <p role="alert" className="rounded-xl bg-[#FBEBC6] p-3 text-sm text-[#5B3D00]">
          APP_SECRET is the development default. Set a long random value before the pilot.
        </p>
      )}

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Reader sessions" value={int(s.sessions)} sub="Anonymous devices" />
        <StatTile
          label="Avg active time"
          value={`${s.avgActiveMinutes.toFixed(1)} min`}
          sub="While the page was visible"
        />
        <StatTile
          label="Words read"
          value={int(s.totalWords)}
          sub={`${int(s.avgWordsPerSession)} per session`}
        />
        <StatTile
          label="Choices made"
          value={int(s.choices.book + s.choices.cyo)}
          sub={`${int(s.choices.book)} in books · ${int(s.choices.cyo)} in stories`}
        />
        <StatTile
          label="Detour cache hit rate"
          value={s.detours.served ? pct(s.detours.hitRate) : "–"}
          sub={`${int(s.detours.cached)} of ${int(s.detours.served)} served from cache`}
        />
        <StatTile
          label="Spend in range"
          value={usd(s.totalCost)}
          sub={`${usd(s.costPerSession)} per generating session`}
        />
        <StatTile label="Undos" value={int(s.undos)} />
        <StatTile label="Feedback link clicks" value={int(s.feedbackClicks)} />
      </section>

      <Panel
        title="Today's spend"
        note="Live generation pauses at the daily budget; cached content and reading keep working."
      >
        <Meter
          value={s.todaySpend}
          max={e.DAILY_BUDGET_USD}
          label={`${usd(s.todaySpend)} of ${usd(e.DAILY_BUDGET_USD)} (UTC day ${utcDay()})`}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Books selected">
          <BarList rows={s.books} labelFor={label} />
        </Panel>
        <Panel title="Reading mode chosen">
          <BarList rows={s.modes} labelFor={label} />
        </Panel>
        <Panel title="Interaction style" note="Books and Create Your Own">
          <BarList rows={s.styles} labelFor={label} />
        </Panel>
        <Panel title="Returns to the original story">
          <BarList rows={s.returnsToCanon} labelFor={label} />
        </Panel>
        <Panel
          title="Create Your Own funnel"
          note={`Sessions reaching each step · Surprise Me used for ${pct(s.surpriseUseRate)} of settings`}
        >
          <BarList rows={s.funnel} />
        </Panel>
        <Panel title="Genres picked">
          <BarList rows={s.genres} labelFor={label} />
        </Panel>
        <Panel title="Ideas redirected by safety checks">
          <BarList rows={s.redirects} labelFor={label} empty="None" />
        </Panel>
        <Panel title="Generation blocked / errors shown">
          <BarList rows={[...s.blocked, ...s.errors]} labelFor={label} empty="None" />
        </Panel>
      </div>

      <Panel
        title="Model usage and estimated cost"
        note="From token usage reported by the API, including failed calls."
      >
        <DataTable
          columns={[
            { key: "kind", label: "Kind" },
            { key: "calls", label: "Calls", numeric: true },
            { key: "failed", label: "Failed", numeric: true },
            { key: "input", label: "Input tokens", numeric: true },
            { key: "output", label: "Output tokens", numeric: true },
            { key: "lat", label: "Avg latency", numeric: true },
            { key: "cost", label: "Est. cost", numeric: true },
          ]}
          rows={s.usageByKind.map((k) => ({
            kind:
              {
                detour: "Book detours",
                cyo_open: "Story openings",
                cyo_cont: "Story continuations",
                moderation: "Moderation checks",
                offline: "Offline",
              }[k.kind] ?? k.kind,
            calls: int(k.calls),
            failed: int(k.failed),
            input: int(k.input),
            output: int(k.output),
            lat: `${(k.avgLatencyMs / 1000).toFixed(1)}s`,
            cost: usd(k.cost),
          }))}
        />
        {s.offline && (
          <p className="mt-3 text-sm text-ink-soft">
            One-time content scripts (this machine): {s.offline.runs} runs, {usd(s.offline.cost)}.
          </p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Cost by day">
          <DataTable
            columns={[
              { key: "day", label: "Day (UTC)" },
              { key: "calls", label: "Calls", numeric: true },
              { key: "cost", label: "Est. cost", numeric: true },
            ]}
            rows={s.usageByDay.map((d) => ({ day: d.day, calls: int(d.calls), cost: usd(d.cost) }))}
          />
        </Panel>
        <Panel title="Cost by book">
          <DataTable
            columns={[
              { key: "book", label: "Book" },
              { key: "calls", label: "Calls", numeric: true },
              { key: "cost", label: "Est. cost", numeric: true },
            ]}
            rows={s.usageByBook.map((b) => ({
              book: label(b.book),
              calls: int(b.calls),
              cost: usd(b.cost),
            }))}
          />
        </Panel>
      </div>

      <Panel title="Group codes" note="Codes typed in by facilitators. No names are collected.">
        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "sessions", label: "Sessions", numeric: true },
            { key: "words", label: "Words read", numeric: true },
          ]}
          rows={s.codes.map((c) => ({
            code: c.code,
            sessions: int(c.sessions),
            words: int(c.words),
          }))}
          empty="No group codes used yet"
        />
      </Panel>
    </div>
  );
}
