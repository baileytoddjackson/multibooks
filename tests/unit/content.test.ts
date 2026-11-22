import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOOKS } from "@/lib/content/books";
import { validateBook } from "@/lib/content/validate";

const BOOKS_DIR = path.resolve(__dirname, "../../content/books");

describe("committed content", () => {
  // Every registered book, so a newly added one is checked too.
  for (const { id } of BOOKS) {
    it(`${id} validates`, () => {
      const report = validateBook(BOOKS_DIR, id);
      expect(report.errors).toEqual([]);
    });
  }
});
