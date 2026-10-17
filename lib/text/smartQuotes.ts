/** Converts straight quotes to the curly ones the Gutenberg texts use, so detours match the page. */
export function smartQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{—–-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–-])'/g, "$1‘")
    .replace(/'/g, "’");
}
