"use client";

import Link from "next/link";
import { getStore, useStoreStatus, useStoreVersion } from "@/lib/client-store";
import { isAdventure } from "@/lib/client-store/types";
import { getBook } from "@/lib/content/books";
import { genreLabel } from "@/lib/cyo/genres";
import { CoverArt } from "./CoverArt";

/** How many of the most recent items each row shows; the rest are in My library. */
const ROW_LIMIT = 6;

function RowHeading({
  id,
  title,
  href,
  total,
}: {
  id: string;
  title: string;
  href: string;
  total: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="font-display text-2xl font-semibold">
        {title}
      </h2>
      <Link
        href={href}
        className="min-h-11 content-center font-semibold text-teal-strong underline-offset-4 hover:underline"
      >
        {total > ROW_LIMIT ? `See all ${total}` : "See all"}
        <span className="sr-only"> in My library</span> →
      </Link>
    </div>
  );
}

/**
 * "Continue reading" (books read as written) and "My Stories" (adventures and Create Your Own)
 * rows with the most recent items, once the reader's saved data has loaded.
 */
export function SavedRows() {
  useStoreVersion(); // re-render on changes
  const status = useStoreStatus();
  if (status !== "ready") return null; // server render, or still loading the reader's library

  const store = getStore();
  const progress = store.listBookProgress();
  const stories = store.listStories();

  return (
    <>
      {progress.length > 0 && (
        <section aria-labelledby="continue-heading" className="mb-10">
          <RowHeading
            id="continue-heading"
            title="Continue reading"
            href="/library?mode=canon"
            total={progress.length}
          />
          <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
            {progress.slice(0, ROW_LIMIT).map((p) => {
              const book = getBook(p.bookId);
              if (!book) return null;
              const pct = Math.round(p.fraction * 100);
              return (
                <li key={p.bookId} className="w-72 shrink-0 snap-start">
                  <Link
                    href={`/read/${p.bookId}?mode=canon`}
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
                      <span className="text-sm text-ink-soft">As written · {pct}%</span>
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
          <RowHeading
            id="stories-heading"
            title="My Stories"
            href="/library"
            total={stories.length}
          />
          <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
            {stories.slice(0, ROW_LIMIT).map((s) => (
              <li key={s.id} className="w-72 shrink-0 snap-start">
                <Link
                  href={`/story/${s.id}`}
                  className="flex min-h-20 flex-col justify-center rounded-2xl bg-card p-4 ring-1 ring-line"
                >
                  <span className="truncate font-display text-lg font-semibold">{s.title}</span>
                  <span className="text-sm text-ink-soft">
                    {isAdventure(s)
                      ? `Adventure · ${getBook(s.bookId)?.shortTitle ?? ""}`
                      : genreLabel(s.genre)}{" "}
                    · {s.status === "done" ? "Finished" : `${s.segments.length} pages`}
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
