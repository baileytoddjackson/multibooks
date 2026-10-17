import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CoverArt } from "@/components/dashboard/CoverArt";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { BOOKS, getBook, readingTimeLabel } from "@/lib/content/books";

export function generateStaticParams() {
  return BOOKS.map((b) => ({ bookId: b.id }));
}

export async function generateMetadata(props: PageProps<"/book/[bookId]">): Promise<Metadata> {
  const { bookId } = await props.params;
  return { title: getBook(bookId)?.title };
}

export default function BookPage(props: PageProps<"/book/[bookId]">) {
  return (
    <>
      <header className="px-4 pt-6 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo />
          <Link href="/" className="min-h-11 content-center rounded-lg px-2 font-semibold">
            ← Library
          </Link>
        </div>
      </header>

      <main id="main" className="px-4 py-8 sm:px-8">
        <Suspense fallback={<div className="mx-auto h-96 max-w-4xl" aria-busy="true" />}>
          <BookDetails params={props.params} />
        </Suspense>
      </main>

      <SiteFooter />
    </>
  );
}

async function BookDetails({ params }: { params: PageProps<"/book/[bookId]">["params"] }) {
  const { bookId } = await params;
  const book = getBook(bookId);
  if (!book) notFound();
  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[2fr_3fr] md:items-start">
      <CoverArt
        id={`hero-${book.id}`}
        from={book.cover.from}
        to={book.cover.to}
        motif={book.cover.motif}
        className="aspect-[3/2] w-full rounded-[var(--radius-card)] shadow-[var(--shadow-page)] md:aspect-[3/4]"
      />

      <div>
        <h1 className="font-display text-4xl leading-tight font-semibold">{book.title}</h1>
        <p className="mt-1 text-ink-soft">
          {book.author}
          {book.translator ? `, translated by ${book.translator}` : ""} ·{" "}
          {readingTimeLabel(book.estMinutes)}
        </p>
        <p className="mt-4 text-lg">{book.hook}</p>

        <h2 className="mt-8 mb-3 font-display text-xl font-semibold">How do you want to read?</h2>
        <ul className="flex flex-col gap-4">
          <li>
            <Link
              href={`/read/${book.id}?mode=canon`}
              className="flex flex-col gap-1 rounded-2xl bg-card p-5 ring-2 ring-line transition-colors hover:ring-teal"
              data-testid="mode-canon"
            >
              <span className="font-display text-xl font-semibold">Read it as written</span>
              <span className="text-ink-soft">
                The original story, just as {book.author} wrote it.
              </span>
            </Link>
          </li>
          <li>
            <Link
              href={`/read/${book.id}?mode=adventure`}
              className="flex flex-col gap-1 rounded-2xl bg-card p-5 ring-2 ring-coral/40 transition-colors hover:ring-coral-strong"
              data-testid="mode-adventure"
            >
              <span className="font-display text-xl font-semibold">
                Play the adventure <span aria-hidden="true">✦</span>
              </span>
              <span className="text-ink-soft">
                Start with the real opening, then make choices along the way. The story always finds
                its way back to the book.
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
