"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Toc } from "@/lib/schemas/content";

/** Contents button + modal list of chapters (native <dialog> for focus trapping and Escape). */
export function ChapterNav({
  toc,
  bookId,
  current,
  mode,
  chapterLabel,
}: {
  toc: Toc;
  bookId: string;
  current: number;
  mode: string;
  chapterLabel: (index: number) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="min-h-11 min-w-11 rounded-full px-3 font-semibold hover:bg-[var(--reader-line)]"
      >
        <svg viewBox="0 0 24 24" className="inline h-5 w-5" aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="sr-only sm:not-sr-only sm:ml-2">Contents</span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby="toc-title"
        className="m-auto max-h-[85dvh] w-[min(92vw,32rem)] rounded-3xl bg-[var(--reader-page)] p-0 text-[var(--reader-text)] shadow-2xl backdrop:bg-black/40"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--reader-line)] bg-[var(--reader-page)] px-5 py-3">
          <h2 id="toc-title" className="font-display text-xl font-semibold">
            Contents
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-11 min-w-11 rounded-full text-2xl hover:bg-[var(--reader-line)]"
            aria-label="Close contents"
          >
            ×
          </button>
        </div>
        <ol className="p-2">
          {toc.chapters.map((c) => (
            <li key={c.index}>
              <Link
                href={`/read/${bookId}/${c.index}?mode=${mode}`}
                onClick={() => ref.current?.close()}
                aria-current={c.index === current ? "page" : undefined}
                className={`flex min-h-12 items-baseline gap-3 rounded-xl px-3 py-2 hover:bg-[var(--reader-line)] ${
                  c.index === current ? "bg-[var(--reader-line)] font-semibold" : ""
                }`}
              >
                <span className="w-24 shrink-0 text-sm text-[var(--reader-muted)]">
                  {chapterLabel(c.index)}
                </span>
                <span className="font-reading">
                  {c.title.startsWith("Book ") ? c.subtitle : c.title}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </dialog>
    </>
  );
}
