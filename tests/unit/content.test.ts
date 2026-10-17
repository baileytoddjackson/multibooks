import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateBook } from "@/lib/content/validate";

const BOOKS_DIR = path.resolve(__dirname, "../../content/books");

describe("committed content", () => {
  for (const id of ["alice", "odyssey", "moby-dick"]) {
    it(`${id} validates`, () => {
      const report = validateBook(BOOKS_DIR, id);
      expect(report.errors).toEqual([]);
    });
  }
});
