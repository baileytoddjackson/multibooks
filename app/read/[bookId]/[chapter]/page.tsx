import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Reader } from "@/components/reader/Reader";
import { ReaderSkeleton } from "@/components/reader/ReaderSkeleton";
import { BOOKS, getBook } from "@/lib/content/books";
import { loadAdventureMap, loadChapter, loadCharacters, loadToc } from "@/lib/content/load";
import { chapterLabel } from "@/lib/reader/labels";

export async function generateStaticParams() {
  const params: { bookId: string; chapter: string }[] = [];
  for (const b of BOOKS) {
    const toc = await loadToc(b.id);
    for (const c of toc.chapters) params.push({ bookId: b.id, chapter: String(c.index) });
  }
  return params;
}

export async function generateMetadata(
  props: PageProps<"/read/[bookId]/[chapter]">,
): Promise<Metadata> {
  const { bookId, chapter } = await props.params;
  const book = getBook(bookId);
  if (!book) return {};
  const toc = await loadToc(bookId);
  const entry = toc.chapters.find((c) => c.index === Number(chapter));
  return { title: entry ? `${chapterLabel(entry)} · ${book.shortTitle}` : book.title };
}

export default async function ReadChapterPage(props: PageProps<"/read/[bookId]/[chapter]">) {
  const { bookId, chapter: chapterParam } = await props.params;
  const book = getBook(bookId);
  const index = Number(chapterParam);
  if (!book || !Number.isInteger(index)) notFound();

  const [toc, chapter, map, cast] = await Promise.all([
    loadToc(bookId),
    loadChapter(bookId, index),
    loadAdventureMap(bookId),
    loadCharacters(bookId),
  ]);
  if (!chapter) notFound();

  return (
    <Suspense fallback={<ReaderSkeleton title={book.shortTitle} />}>
      <Reader book={book} toc={toc} chapter={chapter} map={map} cast={cast.characters} />
    </Suspense>
  );
}
