import "server-only";
import { EXCLUDED_CHAPTERS } from "@/lib/content/adventureMap";
import { getBook } from "@/lib/content/books";
import { loadAdventureMap, loadCharacters, loadSummaries } from "@/lib/content/load";
import { adventureAvailable, entryChoicePoint } from "@/lib/engine/bookAdventure";
import type { ChoicePoint } from "@/lib/schemas/adventure";
import type { BookMeta, Character, Summaries } from "@/lib/schemas/content";
import { buildOutline, type Beat } from "./outline";

export interface AdventureBookContext {
  book: BookMeta;
  summaries: Summaries;
  cast: Character[];
  /** The book's one choice point: where adventures leave the original text. */
  entry: ChoicePoint;
  /** The book's storyline after the entry chapter, as loose beats. */
  outline: Beat[];
}

/** Everything the adventure prompts need from a book's committed content, or undefined. */
export async function loadAdventureBook(bookId: string): Promise<AdventureBookContext | undefined> {
  const book = getBook(bookId);
  if (!book) return undefined;
  const [map, summaries, characters] = await Promise.all([
    loadAdventureMap(book.id),
    loadSummaries(book.id),
    loadCharacters(book.id),
  ]);
  const entry = entryChoicePoint(map);
  if (!entry || !adventureAvailable(map, summaries)) return undefined;
  return {
    book,
    summaries,
    cast: characters.characters,
    entry,
    // Chapters flagged for mature content never steer an adventure.
    outline: buildOutline(
      {
        chapters: summaries.chapters.filter(
          (c) => !(c.index in (EXCLUDED_CHAPTERS[book.id] ?? {})),
        ),
      },
      entry.chapter,
    ),
  };
}
