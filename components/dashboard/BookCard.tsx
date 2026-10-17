import Link from "next/link";
import { TrackedLink } from "@/components/ui/TrackedLink";
import { difficultyLabel, lengthLabel, readingTimeLabel } from "@/lib/content/books";
import type { BookMeta } from "@/lib/schemas/content";
import { CoverArt } from "./CoverArt";

const DIFFICULTY_STYLE: Record<BookMeta["difficulty"], string> = {
  easy: "bg-[#DDF0EC] text-teal-strong",
  medium: "bg-[#FBEBC6] text-[#6B4A06]",
  hard: "bg-[#EDE4F6] text-plum",
};

export function BookCard({ book }: { book: BookMeta }) {
  return (
    <TrackedLink
      event="book_selected"
      eventProps={{ bookId: book.id }}
      href={`/book/${book.id}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-page)] ring-1 ring-line transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
      data-testid={`book-card-${book.id}`}
    >
      <CoverArt
        id={book.id}
        from={book.cover.from}
        to={book.cover.to}
        motif={book.cover.motif}
        className="aspect-[2/1] w-full sm:aspect-[3/2]"
      />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-xl leading-tight font-semibold">{book.title}</h3>
        <p className="text-sm text-ink-soft">
          {book.author}
          {book.translator ? `, translated by ${book.translator}` : ""}
        </p>
        <p className="text-base">{book.hook}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2 text-sm font-semibold">
          <span className={`rounded-full px-3 py-1 ${DIFFICULTY_STYLE[book.difficulty]}`}>
            {difficultyLabel(book)}
          </span>
          <span className="rounded-full bg-paper-deep px-3 py-1 text-ink-soft">
            {lengthLabel(book)} · {readingTimeLabel(book.estMinutes)}
          </span>
        </div>
      </div>
    </TrackedLink>
  );
}

export function CreateCard() {
  return (
    <Link
      href="/create"
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-page)] ring-1 ring-line transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
      data-testid="create-card"
    >
      <CoverArt
        id="create"
        from="#6B4C9A"
        to="#E0563F"
        motif="quill"
        className="aspect-[2/1] w-full sm:aspect-[3/2]"
      />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-xl leading-tight font-semibold">Create Your Own</h3>
        <p className="text-sm text-ink-soft">Written by you (and a little story magic)</p>
        <p className="text-base">Pick a world, make the choices, and see where your story goes.</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2 text-sm font-semibold">
          <span className="rounded-full bg-[#FBE3DD] px-3 py-1 text-[#A33522]">New story</span>
          <span className="rounded-full bg-paper-deep px-3 py-1 text-ink-soft">Any length</span>
        </div>
      </div>
    </Link>
  );
}
