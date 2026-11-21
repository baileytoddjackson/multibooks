import { isAdventure, type BookProgress, type Story } from "@/lib/client-store/types";
import { getBook } from "@/lib/content/books";
import { genreLabel } from "@/lib/cyo/genres";
import type { BookId } from "@/lib/schemas/content";

/**
 * The reader's library (pure): everything they've saved, as one list that can be searched,
 * sorted and filtered. Three kinds of entry:
 *   - "canon":     a book they're reading as written (one per book)
 *   - "adventure": an Adventure Mode story that grew out of a book (any number per book)
 *   - "create":    a Create Your Own story
 */
export type LibraryMode = "canon" | "adventure" | "create";

export const MODE_LABELS: Record<LibraryMode, string> = {
  canon: "As written",
  adventure: "Adventure",
  create: "Create Your Own",
};

export interface LibraryEntry {
  /** Unique across kinds, e.g. "canon:alice" or "story:<uuid>". */
  key: string;
  mode: LibraryMode;
  /** Book id for canon entries; story id for stories. */
  id: string;
  title: string;
  bookId?: BookId;
  /** Where it comes from: the book's short title, or a Create Your Own genre. */
  source: string;
  updatedAt: number;
  /** 0..1 through the book, for reading as written. */
  fraction?: number;
  /** Pages so far, for stories. */
  pages?: number;
  finished: boolean;
  href: string;
  /** Stories can be renamed; a book's title is the book's. */
  renamable: boolean;
}

export function libraryEntries(books: BookProgress[], stories: Story[]): LibraryEntry[] {
  const canon = books.flatMap((p): LibraryEntry[] => {
    const book = getBook(p.bookId);
    if (!book) return [];
    return [
      {
        key: `canon:${p.bookId}`,
        mode: "canon",
        id: p.bookId,
        title: book.title,
        bookId: book.id,
        source: book.shortTitle,
        updatedAt: p.updatedAt,
        fraction: p.fraction,
        finished: p.fraction >= 0.995,
        href: `/read/${p.bookId}?mode=canon`,
        renamable: false,
      },
    ];
  });
  const told = stories.map((s): LibraryEntry => {
    const base = {
      key: `story:${s.id}`,
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
      pages: s.segments.length,
      finished: s.status === "done",
      href: `/story/${s.id}`,
      renamable: true,
    };
    return isAdventure(s)
      ? {
          ...base,
          mode: "adventure",
          bookId: s.bookId,
          source: getBook(s.bookId)?.shortTitle ?? s.bookId,
        }
      : { ...base, mode: "create", source: genreLabel(s.genre) };
  });
  return [...canon, ...told];
}

/* ── Search, sort and filter ────────────────────────────────────────────────────────────── */

export type LibrarySort = "recent" | "title" | "book";

export interface LibraryQuery {
  q: string;
  sort: LibrarySort;
  /** A book id, or "all". */
  book: string;
  mode: LibraryMode | "all";
}

export const DEFAULT_QUERY: LibraryQuery = { q: "", sort: "recent", book: "all", mode: "all" };

const SORTS: LibrarySort[] = ["recent", "title", "book"];
const MODES: (LibraryMode | "all")[] = ["all", "canon", "adventure", "create"];

/** Reads a query from the URL, ignoring anything unexpected. */
export function parseQuery(params: URLSearchParams): LibraryQuery {
  const sort = params.get("sort") as LibrarySort;
  const mode = params.get("mode") as LibraryMode;
  const book = params.get("book") ?? "all";
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    sort: SORTS.includes(sort) ? sort : "recent",
    mode: MODES.includes(mode) ? mode : "all",
    book: book === "all" || getBook(book) ? book : "all",
  };
}

/** The query as URL parameters, leaving out defaults so URLs stay short. */
export function queryParams(query: LibraryQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.q.trim()) p.set("q", query.q.trim());
  if (query.sort !== "recent") p.set("sort", query.sort);
  if (query.book !== "all") p.set("book", query.book);
  if (query.mode !== "all") p.set("mode", query.mode);
  return p;
}

export function isFiltered(query: LibraryQuery): boolean {
  return !!query.q.trim() || query.book !== "all" || query.mode !== "all";
}

/** Lower-case, without accents, so "cafe" finds "Café". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const byTitle = (a: LibraryEntry, b: LibraryEntry) =>
  fold(a.title).localeCompare(fold(b.title)) || b.updatedAt - a.updatedAt;
const byRecent = (a: LibraryEntry, b: LibraryEntry) => b.updatedAt - a.updatedAt;

export function applyQuery(entries: LibraryEntry[], query: LibraryQuery): LibraryEntry[] {
  const words = fold(query.q).split(/\s+/).filter(Boolean);
  const matches = entries.filter((e) => {
    if (query.mode !== "all" && e.mode !== query.mode) return false;
    if (query.book !== "all" && e.bookId !== query.book) return false;
    const haystack = fold(`${e.title} ${e.source} ${MODE_LABELS[e.mode]}`);
    return words.every((w) => haystack.includes(w));
  });
  const sorted = [...matches];
  if (query.sort === "title") sorted.sort(byTitle);
  else if (query.sort === "book") {
    // Books A-Z, newest first within each; Create Your Own stories (no book) come last.
    sorted.sort(
      (a, b) =>
        Number(!a.bookId) - Number(!b.bookId) ||
        fold(a.source).localeCompare(fold(b.source)) ||
        byRecent(a, b),
    );
  } else sorted.sort(byRecent);
  return sorted;
}

/* ── Labels ─────────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "3 days ago", or a short date. */
export function updatedLabel(ts: number, now = Date.now()): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday.getTime() - ts) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const date = new Date(ts);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  });
}

export function progressLabel(e: LibraryEntry): string {
  if (e.mode === "canon")
    return e.finished ? "Finished" : `${Math.round((e.fraction ?? 0) * 100)}% read`;
  if (e.finished) return `Finished · ${e.pages} ${e.pages === 1 ? "page" : "pages"}`;
  if (!e.pages) return "Not started";
  return `${e.pages} ${e.pages === 1 ? "page" : "pages"} so far`;
}
