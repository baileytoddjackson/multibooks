"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CoverArt } from "@/components/dashboard/CoverArt";
import { getStore, notifyStoreChanged, useStoreStatus, useStoreVersion } from "@/lib/client-store";
import { BOOKS, getBook } from "@/lib/content/books";
import { renameStory } from "@/lib/cyo/story";
import {
  applyQuery,
  DEFAULT_QUERY,
  isFiltered,
  libraryEntries,
  MODE_LABELS,
  parseQuery,
  progressLabel,
  queryParams,
  updatedLabel,
  type LibraryEntry,
  type LibraryMode,
  type LibraryQuery,
  type LibrarySort,
} from "@/lib/library/entries";

const MODE_FILTERS: { value: LibraryMode | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "canon", label: "As written" },
  { value: "adventure", label: "Adventures" },
  { value: "create", label: "Create Your Own" },
];

const SORT_LABELS: Record<LibrarySort, string> = {
  recent: "Most recent",
  title: "Title (A–Z)",
  book: "Book",
};

const MODE_BADGE: Record<LibraryMode, string> = {
  canon: "bg-[#DDF0EC] text-teal-strong",
  adventure: "bg-[#FBE3DD] text-coral-strong",
  create: "bg-[#EDE4F6] text-plum",
};

const FIELD =
  "h-11 w-full rounded-xl border-2 border-line bg-card px-3 text-base focus-visible:border-teal focus-visible:outline-none";

/**
 * Everything the reader has saved (books read as written, adventures, Create Your Own stories)
 * with search, sort and filters kept in the URL, and resume / rename / delete on each entry.
 */
export function LibraryView() {
  useStoreVersion(); // re-render on changes
  const status = useStoreStatus();
  const params = useSearchParams();
  const [query, setQuery] = useState<LibraryQuery>(() => parseQuery(params));
  const ids = { search: useId(), sort: useId(), book: useId(), count: useId() };

  // Keep the URL in step (shareable, and survives going back from a story).
  useEffect(() => {
    const qs = queryParams(query).toString();
    window.history.replaceState(null, "", qs ? `/library?${qs}` : "/library");
  }, [query]);

  if (status !== "ready") {
    return <div className="h-96" aria-busy="true" aria-label="Loading your library" />;
  }

  const store = getStore();
  const all = libraryEntries(store.listBookProgress(), store.listStories());
  const shown = applyQuery(all, query);
  const set = (patch: Partial<LibraryQuery>) => setQuery((q) => ({ ...q, ...patch }));

  if (all.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] bg-card p-8 text-center ring-1 ring-line">
        <p className="font-display text-2xl font-semibold">Nothing here yet</p>
        <p className="mt-2 text-ink-soft">
          Books you read, adventures you play and stories you create will all show up here.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center rounded-full bg-teal px-6 font-semibold text-white"
          >
            Pick a book
          </Link>
          <Link
            href="/create"
            className="inline-flex min-h-12 items-center rounded-full bg-plum px-6 font-semibold text-white"
          >
            Create a story
          </Link>
        </div>
      </div>
    );
  }

  const booksInLibrary = BOOKS.filter((b) => all.some((e) => e.bookId === b.id));

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Find a story" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 items-end gap-3 sm:flex">
          <div className="col-span-2 flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor={ids.search} className="font-semibold">
              Search
            </label>
            <input
              id={ids.search}
              type="search"
              value={query.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Title or book"
              maxLength={100}
              autoComplete="off"
              aria-describedby={ids.count}
              className={`${FIELD} font-normal`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.sort} className="font-semibold">
              Sort by
            </label>
            <select
              id={ids.sort}
              value={query.sort}
              onChange={(e) => set({ sort: e.target.value as LibrarySort })}
              className={`${FIELD} font-normal`}
            >
              {Object.entries(SORT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.book} className="font-semibold">
              Book
            </label>
            <select
              id={ids.book}
              value={query.book}
              onChange={(e) => set({ book: e.target.value })}
              className={`${FIELD} font-normal`}
            >
              <option value="all">All books</option>
              {booksInLibrary.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortTitle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 font-semibold">Show</legend>
          {MODE_FILTERS.map((m) => (
            <label
              key={m.value}
              className="flex min-h-11 cursor-pointer items-center rounded-full px-4 font-semibold ring-2 ring-line has-[:checked]:bg-ink has-[:checked]:text-paper has-[:checked]:ring-ink has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plum"
            >
              <input
                type="radio"
                name="library-mode"
                value={m.value}
                checked={query.mode === m.value}
                onChange={() => set({ mode: m.value })}
                className="sr-only"
              />
              {m.label}
            </label>
          ))}
        </fieldset>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={ids.count} role="status" className="text-ink-soft">
          {shown.length === all.length
            ? `${all.length} ${all.length === 1 ? "item" : "items"}`
            : `${shown.length} of ${all.length} items`}
        </p>
        {isFiltered(query) && (
          <button
            type="button"
            onClick={() => setQuery({ ...DEFAULT_QUERY, sort: query.sort })}
            className="min-h-11 rounded-full px-4 text-sm font-semibold ring-2 ring-line hover:bg-paper-deep"
          >
            Clear filters
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-ink-soft ring-1 ring-line">
          Nothing matches. Try another word, or clear the filters.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Your stories and books">
          {shown.map((e) => (
            <li key={e.key} className="flex">
              <EntryCard entry={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryCard({ entry: e }: { entry: LibraryEntry }) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const book = e.bookId ? getBook(e.bookId) : undefined;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const remove = () => {
    const store = getStore();
    if (e.mode === "canon" && e.bookId) store.clearBookProgress(e.bookId);
    else store.deleteStory(e.id);
    notifyStoreChanged();
  };

  const rename = (title: string) => {
    const store = getStore();
    const story = store.getStory(e.id);
    if (story) store.saveStory(renameStory(story, title));
    notifyStoreChanged();
    setRenaming(false);
  };

  return (
    <article
      aria-labelledby={titleId}
      className="flex w-full flex-col gap-3 rounded-[var(--radius-card)] bg-card p-4 ring-1 ring-line"
      data-testid="library-entry"
    >
      <div className="flex items-start gap-4">
        <CoverArt
          id={`lib-${e.key.replace(/[^a-z0-9-]/gi, "")}`}
          from={book?.cover.from ?? "#6B4C9A"}
          to={book?.cover.to ?? "#C2412D"}
          motif={book?.cover.motif ?? "quill"}
          className="h-20 w-20 shrink-0 rounded-xl"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {renaming ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                rename(renameRef.current?.value ?? "");
              }}
            >
              <label htmlFor={`${titleId}-input`} className="sr-only">
                New title
              </label>
              <input
                id={`${titleId}-input`}
                ref={renameRef}
                defaultValue={e.title}
                maxLength={80}
                autoFocus
                className={`${FIELD} min-w-0 flex-1 font-display text-lg`}
              />
              <button
                type="submit"
                className="min-h-11 rounded-full bg-ink px-4 font-semibold text-paper"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-line"
              >
                Cancel
              </button>
            </form>
          ) : (
            <h3 id={titleId} className="font-display text-xl leading-tight font-semibold">
              <Link href={e.href} className="hover:underline">
                {e.title}
              </Link>
            </h3>
          )}
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 font-semibold ${MODE_BADGE[e.mode]}`}>
              {MODE_LABELS[e.mode]}
            </span>
            <span className="text-ink-soft">{e.source}</span>
          </p>
          <p className="text-sm text-ink-soft">
            {progressLabel(e)} · Updated {updatedLabel(e.updatedAt)}
          </p>
          {e.mode === "canon" && (
            <span
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep"
              role="progressbar"
              aria-valuenow={Math.round((e.fraction ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${e.source} progress`}
            >
              <span
                className="block h-full bg-teal"
                style={{ width: `${Math.round((e.fraction ?? 0) * 100)}%` }}
              />
            </span>
          )}
        </div>
      </div>

      {confirming ? (
        <div
          role="group"
          aria-label={`Delete ${e.title}?`}
          className="flex flex-wrap items-center gap-2 rounded-xl bg-coral/10 p-3"
        >
          <p className="flex-1 text-sm">
            {e.mode === "canon"
              ? "Remove this book? Your place in it will be forgotten."
              : "Delete this story for good? This can't be undone."}
          </p>
          <button
            ref={confirmRef}
            type="button"
            onClick={remove}
            className="min-h-11 rounded-full bg-coral-strong px-4 font-semibold text-white"
          >
            {e.mode === "canon" ? "Remove" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-line"
          >
            Keep it
          </button>
        </div>
      ) : (
        !renaming && (
          <div className="mt-auto flex flex-wrap gap-2">
            <Link
              href={e.href}
              aria-label={`${e.finished ? "Open" : "Resume"} ${e.title}`}
              className="inline-flex min-h-11 items-center rounded-full bg-teal px-5 font-semibold text-white hover:bg-teal-strong"
            >
              {e.finished ? "Open" : "Resume"}
            </Link>
            {e.renamable && (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                aria-label={`Rename ${e.title}`}
                className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-line hover:bg-paper-deep"
              >
                Rename
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`${e.mode === "canon" ? "Remove" : "Delete"} ${e.title}`}
              className="min-h-11 rounded-full px-4 font-semibold text-coral-strong ring-2 ring-line hover:bg-paper-deep"
            >
              {e.mode === "canon" ? "Remove" : "Delete"}
            </button>
          </div>
        )
      )}
    </article>
  );
}
