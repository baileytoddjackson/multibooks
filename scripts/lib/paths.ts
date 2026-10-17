import path from "node:path";
import fs from "node:fs/promises";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const RAW_DIR = path.join(ROOT, "content/raw");
export const BOOKS_DIR = path.join(ROOT, "content/books");

export const BOOK_SOURCES = {
  alice: { gutenbergId: 11 },
  odyssey: { gutenbergId: 1727 },
  "moby-dick": { gutenbergId: 2701 },
} as const;

export type ScriptBookId = keyof typeof BOOK_SOURCES;
export const ALL_BOOKS = Object.keys(BOOK_SOURCES) as ScriptBookId[];

export function rawPath(id: ScriptBookId) {
  return path.join(RAW_DIR, `pg${BOOK_SOURCES[id].gutenbergId}.txt`);
}

export function bookDir(id: string) {
  return path.join(BOOKS_DIR, id);
}

export async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

/** `--book alice` / `--book=alice` → ["alice"]; no flag → all books. */
export function booksFromArgs(argv = process.argv.slice(2)): ScriptBookId[] {
  const i = argv.findIndex((a) => a === "--book" || a.startsWith("--book="));
  if (i < 0) return ALL_BOOKS;
  const value = argv[i].includes("=") ? argv[i].split("=")[1] : argv[i + 1];
  if (!value || !(value in BOOK_SOURCES)) {
    throw new Error(`Unknown book "${value}". Use one of: ${ALL_BOOKS.join(", ")}`);
  }
  return [value as ScriptBookId];
}
