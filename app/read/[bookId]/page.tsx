import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReaderSkeleton } from "@/components/reader/ReaderSkeleton";
import { ResumeRedirect } from "@/components/reader/ResumeRedirect";
import { BOOKS, getBook } from "@/lib/content/books";

export function generateStaticParams() {
  return BOOKS.map((b) => ({ bookId: b.id }));
}

/** Entry point from the dashboard: sends the reader to where they left off (or chapter 1). */
export default function ReadBookPage(props: PageProps<"/read/[bookId]">) {
  return (
    <Suspense fallback={<ReaderSkeleton title="" />}>
      <Resume params={props.params} />
    </Suspense>
  );
}

async function Resume({ params }: { params: PageProps<"/read/[bookId]">["params"] }) {
  const { bookId } = await params;
  const book = getBook(bookId);
  if (!book) notFound();
  return (
    <>
      <ResumeRedirect bookId={book.id} />
      <ReaderSkeleton title={book.shortTitle} />
    </>
  );
}
