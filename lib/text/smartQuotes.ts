/** Converts straight quotes to the curly ones the Gutenberg texts use, so generated pages match the book. */
export function smartQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{—–-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–-])'/g, "$1‘")
    .replace(/'/g, "’");
}
