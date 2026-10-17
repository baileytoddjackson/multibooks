import { BookCard, CreateCard } from "@/components/dashboard/BookCard";
import { SavedRows } from "@/components/dashboard/SavedRows";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { BOOKS } from "@/lib/content/books";

export default function Dashboard() {
  return (
    <>
      <header className="px-4 pt-6 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Logo />
        </div>
      </header>

      <main id="main" className="px-4 pt-8 pb-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <section className="mb-10 max-w-2xl">
            <h1 className="font-display text-4xl leading-tight font-semibold sm:text-5xl">
              Pick a book. <span className="text-coral-strong">Choose your path.</span>
            </h1>
            <p className="mt-3 text-lg text-ink-soft">
              Read a classic just as the author wrote it, step inside it as an adventure, or invent
              a brand-new story of your own.
            </p>
          </section>

          <SavedRows />

          <section aria-labelledby="library-heading">
            <h2 id="library-heading" className="mb-4 font-display text-2xl font-semibold">
              The library
            </h2>
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {BOOKS.map((book) => (
                <li key={book.id} className="flex">
                  <BookCard book={book} />
                </li>
              ))}
              <li className="flex">
                <CreateCard />
              </li>
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
