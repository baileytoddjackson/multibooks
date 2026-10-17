# MultiBooks

A choose-your-own-adventure reading app for middle schoolers (ages ~11–14). Read a classic as
written, play it as an adventure that always rejoins the original, or create your own story.

> Status: MVP in progress. Milestones 1–3 are done (dashboard, content pipeline, canon reader,
> book adventures). Next: character-mode polish, Create Your Own, safety, admin stats.

## Quick start

```bash
npm install
cp .env.example .env.local     # works as-is with LLM_PROVIDER=mock (no API key, no cost)
npm run dev                    # http://localhost:3000
```

Requires Node 20.9+.

## Scripts

| Command                                 | What it does                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js dev server, production build, production server                                                                         |
| `npm run lint` / `typecheck` / `format` | ESLint, `tsc --noEmit`, Prettier                                                                                                |
| `npm test`                              | Unit tests (Vitest), including validation of all committed content                                                              |
| `npm run test:e2e`                      | Playwright smoke tests at 390px (iPhone), 820px (iPad) and 1280px. The first run needs `npx playwright install chromium webkit` |

## Content pipeline

Source texts come from Project Gutenberg and are committed as cleaned JSON. The app never fetches
them at runtime.

```bash
npm run content:fetch          # download raw texts to content/raw (gitignored)
npm run content:chunk          # clean, split chapters/paragraphs/pages → content/books/<id>/chapters + toc.json
npm run content:summaries      # chapter summaries + synopsis via the Batch API → summaries.json
npm run content:maps           # adventure choice points via the Batch API → adventure-map.json
npm run content:validate       # check everything (also runs in `npm test`)
```

All of these accept `--book alice|odyssey|moby-dick`.

- **Summaries need `ANTHROPIC_API_KEY`** in `.env.local`. Without a key, the script writes
  placeholder summaries (marked `generatedBy: "placeholder"`) so the rest of the app still works.
  `content:validate` warns until they're replaced. A full real run for all three books costs
  about $0.05 with Claude Haiku 5.5 through the Batch API. Batches are resumable if interrupted.
- **Models** are set by `MODEL_RUNTIME` and `MODEL_OFFLINE` (default `claude-haiku-5-5`). Per-model
  API differences live in `lib/llm/models.ts`; prices for the budget cap are in `lib/llm/pricing.ts`.
- **Characters** (`content/books/<id>/characters.json`) are a hand-curated cast of four per book.
  `firstAppearsChapter` stops readers picking a character before they're in the story.
- **Adventure maps** place one choice point per selected chapter (caps: Alice 12, Odyssey 16,
  Moby-Dick 20). Essay chapters and a hand-curated list of mature chapters
  (`EXCLUDED_CHAPTERS` in `lib/content/adventureMap.ts`) never get choices. Re-running bumps the
  map version, which retires cached detours for that book. Batch results are cached by request
  hash in `data/batches/`, so a re-run after a code fix only pays for changed requests.
- **Detours** are generated on first request, then served from the shared cache (the `detours`
  table) to every later reader. If many readers request the same new detour at once, one
  generates it and the rest wait for it.
- **Paragraph ids** (`c003p017`) are stable anchors used by adventure maps. If you change the
  cleaning rules, re-run `content:validate`.

| Book                             | Source                                 | Notes                                                                     |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Alice's Adventures in Wonderland | Gutenberg #11                          | Poems keep their line breaks                                              |
| The Odyssey                      | Gutenberg #1727 (Samuel Butler, prose) | Uses Roman names (Ulysses, Minerva). Prefaces and footnotes are stripped  |
| Moby-Dick                        | Gutenberg #2701                        | Etymology and Extracts front matter skipped; Epilogue kept as chapter 136 |

### Adding a book

1. Add the Gutenberg id to `scripts/lib/paths.ts`, and add a chapter extractor for its heading
   format in `scripts/clean-and-chunk.ts`.
2. Create `content/books/<id>/meta.json` and `characters.json`, register the meta in
   `lib/content/books.ts`, and add the id to `BookIdSchema` in `lib/schemas/content.ts`.
3. Run `content:fetch`, `content:chunk`, `content:summaries` and `content:validate` with
   `--book <id>`.

## Project layout

```
app/              routes (dashboard, /book/[id], /read/[id]/[chapter])
components/       dashboard, reader, ui
content/books/    committed book content (JSON)
lib/content/      chunking, loading and validation of book content
lib/client-store/ localStorage persistence behind the ProgressStore interface
lib/llm/          model provider types, structured-output parsing, pricing
lib/prompts/      prompt templates (offline ones now; runtime ones in Milestone 3)
lib/reader/       reader progress math and preferences
scripts/          offline content scripts
tests/            unit (Vitest) and e2e (Playwright)
```
