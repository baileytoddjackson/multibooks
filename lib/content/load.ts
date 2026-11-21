import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { AdventureMapSchema, type AdventureMap } from "@/lib/schemas/adventure";
import {
  ChapterSchema,
  CharactersSchema,
  SummariesSchema,
  TocSchema,
  type Chapter,
  type Characters,
  type Summaries,
  type Toc,
} from "@/lib/schemas/content";

/**
 * Server-side loaders for committed book content. Files are read from disk (not bundled into
 * client JS) and cached for the life of the deployment, since content only changes on deploy.
 */
const BOOKS_DIR = path.join(process.cwd(), "content/books");

async function readJson(...parts: string[]): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.join(BOOKS_DIR, ...parts), "utf8"));
}

export async function loadToc(bookId: string): Promise<Toc> {
  "use cache";
  cacheLife("max");
  return TocSchema.parse(await readJson(bookId, "toc.json"));
}

export async function loadChapter(bookId: string, index: number): Promise<Chapter | undefined> {
  "use cache";
  cacheLife("max");
  const file = `${String(index).padStart(3, "0")}.json`;
  try {
    return ChapterSchema.parse(await readJson(bookId, "chapters", file));
  } catch {
    return undefined;
  }
}

export async function loadSummaries(bookId: string): Promise<Summaries> {
  "use cache";
  cacheLife("max");
  return SummariesSchema.parse(await readJson(bookId, "summaries.json"));
}

export async function loadCharacters(bookId: string): Promise<Characters> {
  "use cache";
  cacheLife("max");
  return CharactersSchema.parse(await readJson(bookId, "characters.json"));
}

export async function loadAdventureMap(bookId: string): Promise<AdventureMap | undefined> {
  "use cache";
  cacheLife("max");
  try {
    return AdventureMapSchema.parse(await readJson(bookId, "adventure-map.json"));
  } catch {
    return undefined;
  }
}
