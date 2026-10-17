import aliceMeta from "@/content/books/alice/meta.json";
import odysseyMeta from "@/content/books/odyssey/meta.json";
import mobyDickMeta from "@/content/books/moby-dick/meta.json";
import { BookMetaSchema, type BookId, type BookMeta } from "@/lib/schemas/content";

/**
 * Book registry. Content is static JSON bundled at build time — never fetched at runtime.
 * To add a book: add its folder under content/books, import its meta here, and extend BookIdSchema.
 */
export const BOOKS: readonly BookMeta[] = [aliceMeta, odysseyMeta, mobyDickMeta].map((m) =>
  BookMetaSchema.parse(m),
);

export function getBook(id: string): BookMeta | undefined {
  return BOOKS.find((b) => b.id === id);
}

export function isBookId(id: string): id is BookId {
  return BOOKS.some((b) => b.id === id);
}

const LENGTH_LABEL: Record<BookMeta["length"], string> = {
  short: "Short read",
  medium: "Medium read",
  long: "Long read",
};
const DIFFICULTY_LABEL: Record<BookMeta["difficulty"], string> = {
  easy: "Easier",
  medium: "Medium",
  hard: "Challenge",
};

export function lengthLabel(b: BookMeta) {
  return LENGTH_LABEL[b.length];
}
export function difficultyLabel(b: BookMeta) {
  return DIFFICULTY_LABEL[b.difficulty];
}

/** "About 2½ hours" style label from minutes. */
export function readingTimeLabel(minutes: number): string {
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  const whole = Math.floor(hours);
  const half = hours % 1 !== 0;
  if (whole === 0) return "About ½ hour";
  return `About ${whole}${half ? "½" : ""} hour${whole === 1 && !half ? "" : "s"}`;
}
