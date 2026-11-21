"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackLink } from "@/components/ui/FeedbackLink";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { track, wordsIn } from "@/lib/analytics/track";
import { getStore, notifyStoreChanged } from "@/lib/client-store";
import type { ReadingMode } from "@/lib/client-store/types";
import { newAdventure } from "@/lib/adventure/newAdventure";
import { entryChoicePoint, layoutEntryPage } from "@/lib/engine/bookAdventure";
import { chapterLabel, chapterName } from "@/lib/reader/labels";
import {
  bookFraction,
  pageCount,
  pageForParagraph,
  pageRange,
  pageWords,
} from "@/lib/reader/progress";
import { useReaderPrefs } from "@/lib/reader/usePrefs";
import type { AdventureMap } from "@/lib/schemas/adventure";
import type { BookMeta, Chapter, Character, Toc } from "@/lib/schemas/content";
import { AdventureBlocks, type EntryChoice } from "./AdventureBlocks";
import { ChapterNav } from "./ChapterNav";
import { Passage } from "./Passage";
import { ReaderControls } from "./ReaderControls";

export interface ReaderProps {
  book: BookMeta;
  toc: Toc;
  chapter: Chapter;
  /** The book's adventure map, if it has one (its entry choice is where adventures begin). */
  map?: AdventureMap;
  cast: Character[];
}

function readMode(v: string | null): ReadingMode {
  return v === "adventure" ? "adventure" : "canon";
}

/**
 * Shared book reader. "As written" shows the original text page by page and saves the reader's
 * place. Adventure Mode shows the real opening up to the book's entry choice; choosing there
 * starts a new Adventure Mode story (/story/[id]) that never returns to the original text.
 *
 * Renders client-side only (it sits under a Suspense boundary and reads search params),
 * so it can read saved progress synchronously on first render without a hydration flash.
 */
export function Reader({ book, toc, chapter, map, cast }: ReaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mode = readMode(params.get("mode"));
  const [prefs, setPrefs] = useReaderPrefs();

  const pages = pageCount(chapter);
  const [page, setPage] = useState(() => {
    const fromUrl = Number(params.get("page"));
    if (Number.isInteger(fromUrl) && fromUrl >= 1 && fromUrl <= pages) return fromUrl - 1;
    // An adventure always starts from the top of its opening chapter.
    const saved = mode === "canon" ? getStore().getBookProgress(book.id) : undefined;
    return saved?.position.startsWith(`c${String(chapter.index).padStart(3, "0")}`)
      ? pageForParagraph(chapter, saved.position)
      : 0;
  });

  const entryIdx = toc.chapters.findIndex((c) => c.index === chapter.index);
  const tocEntry = toc.chapters[entryIdx];
  const prevChapter = toc.chapters[entryIdx - 1];
  const nextChapter = toc.chapters[entryIdx + 1];
  const isLastPage = page === pages - 1;
  const fraction = bookFraction(toc, chapter, page);
  const pct = Math.round(fraction * 100);

  // ── Adventure Mode: the opening, up to the entry choice ─────────────────────────────
  const entry = entryChoicePoint(map);
  const adventureOn = mode === "adventure" && !!entry;
  const { start, end } = pageRange(chapter, page);
  const layout = adventureOn ? layoutEntryPage(chapter, { start, end }, entry) : undefined;
  const blocked = layout?.blocked ?? false;

  // Adventures always begin at the entry chapter.
  useEffect(() => {
    if (adventureOn && entry && entry.chapter !== chapter.index) {
      router.replace(`/read/${book.id}/${entry.chapter}?mode=adventure`);
    }
  }, [adventureOn, entry, chapter.index, book.id, router]);

  const startAdventure = ({ option, view, style, characterId }: EntryChoice) => {
    if (!entry) return;
    const story = newAdventure({ book, entry, cast, option, view, style, characterId });
    track("choice_made", {
      context: "book",
      bookId: book.id,
      cpId: entry.id,
      optionId: option.id,
      perspective: view.perspective,
    });
    track("adventure_started", { bookId: book.id, optionId: option.id, style });
    getStore().saveStory(story);
    notifyStoreChanged();
    router.push(`/story/${story.id}`);
  };

  const pageRef = useRef<HTMLElement>(null);
  // The page last shown; focus only moves when the page actually changes (not on mount or
  // React's dev-mode double effect run).
  const shownPage = useRef(page);

  // Persist progress and keep ?page in the URL (shareable, survives refresh).
  useEffect(() => {
    // On the way to the adventure's opening chapter: leave the URL to the redirect.
    if (adventureOn && entry && entry.chapter !== chapter.index) return;
    // Only reading as written has a place to save; an adventure's opening isn't progress.
    if (mode === "canon") {
      const { start } = pageRange(chapter, page);
      const store = getStore();
      const prev = store.getBookProgress(book.id);
      store.saveBookProgress({
        bookId: book.id,
        position: chapter.paragraphs[start].id,
        fraction,
        wordsRead: prev?.wordsRead ?? 0,
        updatedAt: Date.now(),
      });
      notifyStoreChanged();
    }

    const url = new URLSearchParams(params.toString());
    url.set("page", String(page + 1));
    window.history.replaceState(null, "", `${pathname}?${url}`);

    if (shownPage.current !== page) {
      shownPage.current = page;
      window.scrollTo({ top: 0 });
      // Move focus to the new page for keyboard and screen-reader users.
      pageRef.current?.focus({ preventScroll: true });
    }
    // params intentionally omitted: we only react to page/chapter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, chapter.index, mode]);

  // Plain functions: the React Compiler memoizes these automatically.
  const addWordsRead = (n: number) => {
    if (mode !== "canon") return;
    const store = getStore();
    const p = store.getBookProgress(book.id);
    if (p) store.saveBookProgress({ ...p, wordsRead: p.wordsRead + n });
  };

  const goNext = () => {
    if (blocked) return;
    // Words actually shown on this page.
    const words = layout
      ? layout.blocks.reduce(
          (n, b) => n + (b.type === "canon" ? wordsIn(...b.paragraphs.map((p) => p.text)) : 0),
          0,
        )
      : pageWords(chapter, page);
    addWordsRead(words);
    track("words_read", { context: "book", bookId: book.id, words: Math.min(words, 5000) });
    if (!isLastPage) setPage((p) => p + 1);
    else if (nextChapter) router.push(`/read/${book.id}/${nextChapter.index}?mode=${mode}&page=1`);
  };

  const goPrev = () => {
    if (page > 0) setPage((p) => p - 1);
    else if (prevChapter) {
      router.push(`/read/${book.id}/${prevChapter.index}?mode=${mode}&page=${prevChapter.pages}`);
    }
  };

  // Arrow keys turn pages (ignored while typing or when a dialog is open). The listener is
  // registered once and always calls the latest handlers through a ref.
  const navRef = useRef({ goNext, goPrev });
  useEffect(() => {
    navRef.current = { goNext, goPrev };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, dialog[open]") || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key === "ArrowRight") navRef.current.goNext();
      if (e.key === "ArrowLeft") navRef.current.goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Horizontal swipe on touch screens (iPad) turns pages.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || window.getSelection()?.toString()) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? goNext : goPrev)();
  };

  const label = chapterLabel(tocEntry);
  const name = chapterName(tocEntry);
  const showNudge = mode === "canon" && !!entry && isLastPage && chapter.index === 1;
  const modeHref = (m: ReadingMode) =>
    m === "adventure"
      ? `/read/${book.id}/${entry?.chapter ?? 1}?mode=adventure`
      : `/read/${book.id}/${chapter.index}?mode=canon&page=${page + 1}`;

  return (
    <div
      data-theme={prefs.theme}
      data-font-size={prefs.fontSize}
      className="flex min-h-dvh flex-col bg-[var(--reader-bg)] text-[var(--reader-text)] transition-colors"
    >
      <header className="sticky top-0 z-20 bg-[var(--reader-bg)]">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-2 py-1 sm:px-4">
          <Link
            href="/"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 font-semibold hover:bg-[var(--reader-line)]"
          >
            <span aria-hidden="true">←</span>
            <span className="sr-only sm:not-sr-only sm:ml-2">Library</span>
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-display font-semibold">{book.shortTitle}</p>
            <p className="truncate text-sm text-[var(--reader-muted)]">
              {mode === "adventure" ? "Adventure" : "As written"} · {label}
            </p>
          </div>
          {!adventureOn && (
            <ChapterNav
              toc={toc}
              bookId={book.id}
              current={chapter.index}
              mode={mode}
              chapterLabel={(i) => chapterLabel(toc.chapters.find((c) => c.index === i)!)}
            />
          )}
          {adventureOn ? (
            <TrackedLink
              event="mode_chosen"
              eventProps={{ bookId: book.id, mode: "canon" }}
              href={modeHref("canon")}
              className="flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold hover:bg-[var(--reader-line)]"
            >
              As written
            </TrackedLink>
          ) : (
            entry && (
              <TrackedLink
                event="mode_chosen"
                eventProps={{ bookId: book.id, mode: "adventure" }}
                href={modeHref("adventure")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 font-semibold text-[var(--reader-accent)] hover:bg-[var(--reader-line)]"
              >
                <span aria-hidden="true">✦</span>
                <span className="sr-only">Play this as an adventure</span>
              </TrackedLink>
            )
          )}
          <ReaderControls prefs={prefs} onChange={setPrefs} />
        </div>
        <div
          className="h-1 w-full bg-[var(--reader-line)]"
          role="progressbar"
          aria-label="Progress through the book"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${label}, ${pct}% through the book`}
        >
          <div
            className="h-full bg-teal transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      {mode === "adventure" && !entry && (
        <p className="mx-auto mt-4 max-w-[48rem] rounded-xl bg-[var(--reader-page)] px-4 py-3 text-center text-sm text-[var(--reader-muted)] ring-1 ring-[var(--reader-line)]">
          Adventures for this book are still being written. For now, enjoy the original story!
        </p>
      )}

      <main
        id="main"
        className="flex-1 px-2 py-4 sm:px-6 sm:py-10"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <article
          key={`${chapter.index}-${page}`}
          ref={pageRef}
          tabIndex={-1}
          aria-label={`${label}, page ${page + 1} of ${pages}`}
          className="paper-grain animate-page-in mx-auto max-w-[48rem] rounded-[var(--radius-card)] bg-[var(--reader-page)] px-5 py-8 shadow-[var(--shadow-page)] ring-1 ring-[var(--reader-line)] focus-visible:outline-none sm:px-14 sm:py-14"
        >
          {page === 0 && (
            <header className="mb-8 text-center">
              <p className="text-sm font-semibold tracking-[0.2em] text-[var(--reader-muted)] uppercase">
                {label}
              </p>
              {name && (
                <h1 className="mt-2 font-display text-3xl leading-tight font-semibold sm:text-4xl">
                  {name}
                </h1>
              )}
            </header>
          )}
          <div className="prose-book mx-auto">
            {layout ? (
              <AdventureBlocks
                blocks={layout.blocks}
                cast={cast}
                onStart={startAdventure}
                onKeepOriginal={() => {
                  track("mode_chosen", { bookId: book.id, mode: "canon" });
                  router.push(modeHref("canon"));
                }}
              />
            ) : (
              <Passage paragraphs={chapter.paragraphs.slice(start, end)} />
            )}
          </div>
          <p className="mt-10 text-center text-sm text-[var(--reader-muted)]">
            Page {page + 1} of {pages}
          </p>

          {showNudge && (
            <aside className="mt-8 rounded-2xl border-2 border-dashed border-[var(--reader-accent)] p-5 text-center">
              <p className="font-display text-xl font-semibold">Want to step inside the story?</p>
              <p className="mt-1 text-[var(--reader-muted)]">
                Try this book as an adventure and make choices along the way.
              </p>
              <TrackedLink
                event="mode_chosen"
                eventProps={{ bookId: book.id, mode: "adventure" }}
                href={modeHref("adventure")}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-plum px-5 font-semibold text-white"
              >
                Try it as an adventure ✦
              </TrackedLink>
            </aside>
          )}
        </article>
      </main>

      <nav
        aria-label="Page navigation"
        className="sticky bottom-0 z-10 bg-[var(--reader-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-[48rem] items-center justify-between gap-3 px-3 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={page === 0 && !prevChapter}
            className="min-h-12 rounded-full px-5 font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)] disabled:opacity-40"
          >
            ← <span className="sr-only sm:not-sr-only">Previous</span>
          </button>
          <span className="text-sm text-[var(--reader-muted)]" aria-hidden="true">
            {pct}%
          </span>
          {isLastPage && !nextChapter ? (
            <Link
              href="/"
              className="min-h-12 content-center rounded-full bg-teal px-6 font-semibold text-white"
            >
              The end · Back to library
            </Link>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={blocked}
              aria-describedby={blocked ? "blocked-hint" : undefined}
              className="min-h-12 rounded-full bg-teal px-6 font-semibold text-white hover:bg-teal-strong disabled:opacity-40"
            >
              {isLastPage ? "Next chapter" : "Next page"} →
            </button>
          )}
        </div>
        {blocked && (
          <p id="blocked-hint" className="pb-1 text-center text-sm text-[var(--reader-muted)]">
            Make a choice above to start your adventure.
          </p>
        )}
        <div className="flex justify-center pb-1">
          <FeedbackLink className="text-sm text-[var(--reader-accent)]" />
        </div>
      </nav>
    </div>
  );
}
