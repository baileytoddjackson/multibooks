/**
 * One-time download of source texts from Project Gutenberg into content/raw (gitignored).
 * The app never fetches at runtime — run this, then `npm run content:chunk`, and commit the JSON.
 *
 *   npm run content:fetch               # all books
 *   npm run content:fetch -- --book alice
 */
import fs from "node:fs/promises";
import { BOOK_SOURCES, RAW_DIR, booksFromArgs, rawPath } from "./lib/paths";

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  for (const id of booksFromArgs()) {
    const { gutenbergId } = BOOK_SOURCES[id];
    const url = `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`;
    process.stdout.write(`Fetching ${id} (#${gutenbergId})… `);
    const res = await fetch(url, { headers: { "User-Agent": "MultiBooks content script" } });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    await fs.writeFile(rawPath(id), text);
    console.log(`${(text.length / 1024).toFixed(0)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
