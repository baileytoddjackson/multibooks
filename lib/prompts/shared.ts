/**
 * Rules shared by every runtime prompt. Changing anything here changes generated text, so bump
 * PROMPT_VERSION (lib/prompts/version.ts) to invalidate cached detours.
 */

export const AUDIENCE_AND_SAFETY = `You are writing for readers aged 11-14 in a school reading app.

Safety (always):
- No graphic violence, gore, or cruelty. Classic danger (storms, monsters, battles, whale hunts) is
  fine, told without blood or injury detail: show tension and courage, not wounds.
- No romance beyond what the original book contains, no sexual content, no drugs, no swearing.
- No self-harm, no suicide, nothing that encourages unsafe behaviour.
- Treat every culture, people and character with respect. No stereotypes.
- Never ask the reader for personal information and never address the reader by name.`;

export const READING_LEVEL = `Reading level:
- Grade 6-8 vocabulary. Prefer common words; if an old or nautical word is needed, make its meaning
  clear from context.
- Mostly 8-20 word sentences. Vary length, but avoid long chains of clauses.
- Paragraphs of 1-4 sentences. Separate paragraphs with a blank line ("\\n\\n").
- No walls of text, no lists, no headings, no emoji.`;
