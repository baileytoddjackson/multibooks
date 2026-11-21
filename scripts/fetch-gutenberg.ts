/**
 * One-time download of source texts from Project Gutenberg into content/raw (gitignored).
 * The app never fetches at runtime — run this, then `npm run content:chunk`, and commit the JSON.
 *
 *   npm run content:fetch               # all books
 *   npm run content:fetch -- --book alice
 */
import fs from "node:fs/promises";
import { BOOK_SOURCES, RAW_DIR, booksFromArgs, rawPath } from "./lib/paths";

/** Project Gutenberg, then its official PGLAF mirror (same files) if the main site is down. */
const HOSTS = ["https://www.gutenberg.org", "https://gutenberg.pglaf.org"];

async function download(gutenbergId: number): Promise<string> {
  const errors: string[] = [];
  for (const host of HOSTS) {
    const url = `${host}/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`;
    const res = await fetch(url, { headers: { "User-Agent": "MultiBooks content script" } });
    if (res.ok) return res.text();
    errors.push(`${url} → HTTP ${res.status}`);
  }
  throw new Error(errors.join("\n"));
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  for (const id of booksFromArgs()) {
    const { gutenbergId } = BOOK_SOURCES[id];
    process.stdout.write(`Fetching ${id} (#${gutenbergId})… `);
    const text = await download(gutenbergId);
    await fs.writeFile(rawPath(id), text);
    console.log(`${(text.length / 1024).toFixed(0)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
