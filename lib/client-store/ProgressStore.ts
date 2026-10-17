import type { BookId } from "@/lib/schemas/content";
import type { BookProgress, CyoStory, ReaderPrefs, Session } from "./types";

/**
 * Client persistence boundary. The MVP stores everything in localStorage under an anonymous
 * session id; a database-backed implementation can replace it without touching UI code.
 */
export interface ProgressStore {
  getSession(): Session;
  setSessionCode(code: string | undefined): Session;

  getBookProgress(bookId: BookId): BookProgress | undefined;
  saveBookProgress(progress: BookProgress): void;
  listBookProgress(): BookProgress[];
  clearBookProgress(bookId: BookId): void;

  getStory(id: string): CyoStory | undefined;
  saveStory(story: CyoStory): void;
  listStories(): CyoStory[];
  deleteStory(id: string): void;

  getReaderPrefs(): ReaderPrefs;
  saveReaderPrefs(prefs: ReaderPrefs): void;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = { fontSize: "m", theme: "light" };
