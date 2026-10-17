import { smartQuotes } from "./smartQuotes";

/**
 * Final clean-up for any model-written text before readers see it:
 * - removes stray characters from non-Latin scripts (models occasionally emit e.g. "and探 explore"),
 *   keeping accented letters, punctuation, symbols and digits;
 * - tidies the spaces that removal can leave behind;
 * - curls quotes to match the Gutenberg texts.
 */
export function cleanGeneratedText(text: string): string {
  return smartQuotes(
    text
      .replace(/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/gu, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([.,;:!?])/g, "$1")
      .trim(),
  );
}
