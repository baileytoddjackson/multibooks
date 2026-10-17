import fs from "node:fs";
import path from "node:path";
import { fateClaims, validateMap } from "@/lib/content/adventureMap";
import { AdventureMapSchema } from "@/lib/schemas/adventure";
import {
  BookMetaSchema,
  ChapterSchema,
  CharactersSchema,
  SummariesSchema,
  TocSchema,
  type Chapter,
  type Toc,
} from "@/lib/schemas/content";

export interface ValidationReport {
  bookId: string;
  errors: string[];
  warnings: string[];
  /** Items for human review, shown with --verbose (e.g. fate claims in adventure briefs). */
  review: string[];
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function check<T>(
  label: string,
  file: string,
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { message: string } };
  },
  report: ValidationReport,
): T | undefined {
  if (!fs.existsSync(file)) {
    report.errors.push(`${label}: missing ${path.basename(file)}`);
    return undefined;
  }
  const r = schema.safeParse(readJson(file));
  if (!r.success) {
    report.errors.push(`${label}: ${r.error.message.slice(0, 300)}`);
    return undefined;
  }
  return r.data;
}

/** Validates every committed content file for one book. Synchronous and fs-only for CI/tests. */
export function validateBook(booksDir: string, bookId: string): ValidationReport {
  const dir = path.join(booksDir, bookId);
  const report: ValidationReport = { bookId, errors: [], warnings: [], review: [] };

  check("meta", path.join(dir, "meta.json"), BookMetaSchema, report);
  const toc: Toc | undefined = check("toc", path.join(dir, "toc.json"), TocSchema, report);
  if (!toc) return report;

  const ids = new Set<string>();
  const chapters = new Map<number, Chapter>();
  for (const entry of toc.chapters) {
    const file = path.join(dir, "chapters", `${String(entry.index).padStart(3, "0")}.json`);
    const ch = check(`chapter ${entry.index}`, file, ChapterSchema, report);
    if (!ch) continue;
    chapters.set(ch.index, ch);
    if (ch.index !== entry.index) report.errors.push(`chapter ${entry.index}: index mismatch`);
    if (ch.pageStarts[0] !== 0)
      report.errors.push(`chapter ${entry.index}: pageStarts must begin at 0`);
    if (ch.pageStarts.some((s) => s >= ch.paragraphs.length)) {
      report.errors.push(`chapter ${entry.index}: pageStarts out of range`);
    }
    for (const p of ch.paragraphs) {
      if (ids.has(p.id)) report.errors.push(`duplicate paragraph id ${p.id}`);
      ids.add(p.id);
      if (/Project Gutenberg|\[Illustration/i.test(p.text)) {
        report.errors.push(`${p.id}: Gutenberg boilerplate leaked into text`);
      }
    }
  }

  const summaries = check("summaries", path.join(dir, "summaries.json"), SummariesSchema, report);
  if (summaries) {
    if (summaries.chapters.length !== toc.chapters.length) {
      report.errors.push(
        `summaries: ${summaries.chapters.length} entries for ${toc.chapters.length} chapters`,
      );
    }
    const placeholders = summaries.chapters.filter((s) => s.generatedBy === "placeholder").length;
    if (placeholders) {
      report.warnings.push(
        `summaries: ${placeholders} placeholder chapters (run content:summaries with an API key)`,
      );
    }
  }

  const cast = check("characters", path.join(dir, "characters.json"), CharactersSchema, report);
  if (cast) {
    for (const c of cast.characters) {
      if (c.firstAppearsChapter > toc.chapters.length) {
        report.errors.push(`character ${c.id}: firstAppearsChapter beyond last chapter`);
      }
    }
    if (cast.characters.filter((c) => c.pov === "first").length > 1) {
      report.errors.push("characters: only the book's narrator may use first person");
    }
  }

  // Adventure maps are optional (a book without one is canon-only).
  const mapFile = path.join(dir, "adventure-map.json");
  if (fs.existsSync(mapFile) && cast) {
    const map = check("adventure map", mapFile, AdventureMapSchema, report);
    if (map) {
      validateMap(map, chapters, cast.characters).forEach((e) => report.errors.push(`map: ${e}`));
      const claims = fateClaims(map);
      report.review.push(...claims.map((c) => `fate claim ${c}`));
      if (claims.length) {
        report.warnings.push(
          `map: ${claims.length} briefs mention who lives/dies/is safe; check them against the book (--verbose)`,
        );
      }
      if (map.generatedBy === "placeholder") {
        report.warnings.push("adventure map is a placeholder (run content:maps with an API key)");
      }
    }
  }

  return report;
}
