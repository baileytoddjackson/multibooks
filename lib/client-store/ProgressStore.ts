import type { BookId } from "@/lib/schemas/content";
import type { BookProgress, ReaderPrefs, Session, Story } from "./types";

/**
 * Client persistence boundary. Book progress and stories belong to the signed-in account (see
 * syncedStore.ts); the anonymous analytics session and reader preferences stay on the device.
 */
export interface ProgressStore {
  getSession(): Session;
  setSessionCode(code: string | undefined): Session;

  getBookProgress(bookId: BookId): BookProgress | undefined;
  saveBookProgress(progress: BookProgress): void;
  listBookProgress(): BookProgress[];
  clearBookProgress(bookId: BookId): void;

  /** Create Your Own stories and Adventure Mode stories. */
  getStory(id: string): Story | undefined;
  saveStory(story: Story): void;
  listStories(): Story[];
  deleteStory(id: string): void;

  getReaderPrefs(): ReaderPrefs;
  saveReaderPrefs(prefs: ReaderPrefs): void;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = { fontSize: "m", theme: "light" };
