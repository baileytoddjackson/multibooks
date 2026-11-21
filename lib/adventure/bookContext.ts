import "server-only";
import { getBook } from "@/lib/content/books";
import { loadAdventureMap, loadCharacters, loadSummaries } from "@/lib/content/load";
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
  const entry = map?.choicePoints.find((cp) => cp.isIntro) ?? map?.choicePoints[0];
  if (!entry) return undefined;
  return {
    book,
    summaries,
    cast: characters.characters,
    entry,
    outline: buildOutline(summaries, entry.chapter),
  };
}
