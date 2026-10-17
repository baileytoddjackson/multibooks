/**
 * Validates all committed book content (chapters, toc, summaries, characters, and later
 * adventure maps). Exits non-zero on errors; placeholder content is reported as a warning.
 *
 *   npm run content:validate
 *   npm run content:validate -- --verbose     # also list items for human review
 */
import { validateBook } from "../lib/content/validate";
import { BOOKS_DIR, booksFromArgs } from "./lib/paths";

let failed = false;
for (const id of booksFromArgs()) {
  const r = validateBook(BOOKS_DIR, id);
  const status = r.errors.length ? "✗" : "✓";
  console.log(`${status} ${id}`);
  r.errors.forEach((e) => console.log(`   error: ${e}`));
  r.warnings.forEach((w) => console.log(`   warning: ${w}`));
  if (process.argv.includes("--verbose")) r.review.forEach((x) => console.log(`   review: ${x}`));
  if (r.errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
