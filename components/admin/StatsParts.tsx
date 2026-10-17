import type { ReactNode } from "react";

/** Admin stats building blocks. One hue (teal) for magnitude; all text stays in ink tokens. */

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-sans text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-line" aria-label={title}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-ink-soft">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Horizontal bars for comparing counts. Every bar carries its value as text (no color-only
 * meaning) and a native tooltip; the list itself is the table view.
 */
export function BarList({
  rows,
  format = (n) => n.toLocaleString(),
  labelFor = (s) => s,
  empty = "No data yet",
}: {
  rows: { label: string; value: number }[];
  format?: (n: number) => string;
  labelFor?: (s: string) => string;
  empty?: string;
}) {
  if (!rows.length || rows.every((r) => r.value === 0)) {
    return <p className="text-sm text-ink-soft">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const label = labelFor(r.label);
        return (
          <li
            key={r.label}
            className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate" title={label}>
              {label}
            </span>
            <span className="h-4 rounded-r bg-paper-deep" aria-hidden="true">
              <span
                className="block h-full rounded-r bg-teal"
                style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 1.5 : 0)}%` }}
                title={`${label}: ${format(r.value)}`}
              />
            </span>
            <span className="text-right font-semibold tabular-nums">{format(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 1;
  return (
    <div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-paper-deep"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-teal" style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="mt-1 text-sm text-ink-soft">{label}</p>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty = "No data yet",
}: {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, ReactNode>[];
  empty?: string;
}) {
  if (!rows.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`py-2 pr-4 font-semibold ${c.numeric ? "text-right" : ""}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 pr-4 ${c.numeric ? "text-right tabular-nums" : ""}`}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
