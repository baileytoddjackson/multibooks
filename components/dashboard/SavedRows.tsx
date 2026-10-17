"use client";

import Link from "next/link";
import { getStore, useStoreVersion } from "@/lib/client-store";
import { getBook } from "@/lib/content/books";
import { CoverArt } from "./CoverArt";

/** "Continue reading" and "My Stories" rows, read from the client store after hydration. */
export function SavedRows() {
  const version = useStoreVersion();
  if (version < 0) return null; // server render / pre-hydration: nothing saved to show yet

  const store = getStore();
  const progress = store.listBookProgress();
  const stories = store.listStories();

  return (
    <>
      {progress.length > 0 && (
        <section aria-labelledby="continue-heading" className="mb-10">
          <h2 id="continue-heading" className="mb-4 font-display text-2xl font-semibold">
            Continue reading
          </h2>
          <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
            {progress.map((p) => {
              const book = getBook(p.bookId);
              if (!book) return null;
              const pct = Math.round(p.fraction * 100);
              return (
                <li key={p.bookId} className="w-72 shrink-0 snap-start">
                  <Link
                    href={`/read/${p.bookId}?mode=${p.mode}`}
                    className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-line"
                  >
                    <CoverArt
                      id={`continue-${p.bookId}`}
                      from={book.cover.from}
                      to={book.cover.to}
                      motif={book.cover.motif}
                      className="h-16 w-16 shrink-0 rounded-xl"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{book.shortTitle}</span>
                      <span className="text-sm text-ink-soft">
                        {p.mode === "adventure" ? "Adventure" : "As written"} · {pct}%
                      </span>
                      <span
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${book.shortTitle} progress`}
                      >
                        <span className="block h-full bg-teal" style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {stories.length > 0 && (
        <section aria-labelledby="stories-heading" className="mb-10">
          <h2 id="stories-heading" className="mb-4 font-display text-2xl font-semibold">
            My Stories
          </h2>
          <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
            {stories.map((s) => (
              <li key={s.id} className="w-72 shrink-0 snap-start">
                <Link
                  href={`/story/${s.id}`}
                  className="flex min-h-20 flex-col justify-center rounded-2xl bg-card p-4 ring-1 ring-line"
                >
                  <span className="truncate font-display text-lg font-semibold">{s.title}</span>
                  <span className="text-sm text-ink-soft capitalize">
                    {s.genre} · {s.status === "done" ? "Finished" : `${s.segments.length} pages`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
