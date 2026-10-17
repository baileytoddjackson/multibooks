# MultiBooks

A choose-your-own-adventure reading app for middle schoolers (ages ~11–14). Read a classic as
written, play it as an adventure that always rejoins the original, or create your own story.

> Status: MVP in progress. Milestones 1–7 are done. Next: cache pre-warm, the content review
> export, and final polish.

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

## Create Your Own

A 3-step stepper (genre → setting → optional details) starts a fully generated story.

- **Surprise Me is free.** It picks from `content/surprise-settings.json`: 8 genres × 52
  hand-written, kid-safe settings. Edit that file to add or change ideas.
- **Safety on the only free-text fields.** In order: length limits (120 and 280 characters), a
  personal-information filter (`lib/safety/piiPatterns.ts`), a word blocklist
  (`lib/safety/blocklist.ts`), then a cheap Claude check (`lib/prompts/moderation.ts`). Ideas that
  fail get a friendly redirect with Surprise Me suggestions, never an error.
- **Generated text is checked as it streams.** Text is released one sentence at a time after
  passing the blocklist. If something trips it, the reader never sees it and one stricter retry
  runs.
- **Compact state.** Each turn sends only a running summary (120 words or fewer) and the last
  segment, so cost per turn stays flat (about $0.0006 with Haiku 5.5).
- **Length.** `CYO_SOFT_TURN_CAP` offers "Ready to write the ending?" and `CYO_HARD_TURN_CAP`
  forces the ending. Stories are saved on the device under My Stories.

## Cost controls and limits

Every new generation goes through `guardGeneration` (`lib/budget/budget.ts`). Cached detours,
approved detours and canon reading never do, so they keep working when a limit is hit.

| Setting                                   | Default     | What happens when it's reached                                                                                             |
| ----------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DAILY_BUDGET_USD`                        | `5`         | All new generation pauses until midnight UTC; readers see "The story machine is resting" and can keep reading the original |
| `PER_SESSION_MAX_GENERATIONS`             | `40`        | Same message, for that device only                                                                                         |
| `RATE_LIMIT_SESSION_PER_MINUTE`           | `8`         | A short "Lots of readers are adventuring right now…" pause, then an automatic retry                                        |
| `RATE_LIMIT_IP_PER_MINUTE`                | `150`       | Same. Kept generous because a whole classroom usually shares one public IP                                                 |
| `CYO_SOFT_TURN_CAP` / `CYO_HARD_TURN_CAP` | `20` / `25` | "Ready to write the ending?" / the ending is written                                                                       |

Spend is estimated from the token usage the API reports for every call, including failed ones,
using `lib/llm/pricing.ts`. IP addresses are never stored: rate limiting uses a salted hash that
changes daily. At Haiku 5.5 prices, $5 a day covers roughly 7,000–10,000 new passages.

## Research instrumentation and admin stats

**Events.** The app records anonymous events defined in `lib/analytics/events.ts`:

- books selected, reading mode chosen and interaction style chosen;
- choices made, detours served (cached or new), returns to the original, undos;
- words read, active time (a 30-second heartbeat while the page is visible);
- the stepper funnel, stories created and finished, safety redirects, blocked generations,
  errors and feedback clicks.

Every field is an id, a number or a yes/no, so no free text, names or IPs are ever stored. Events
are batched in the browser and sent with `sendBeacon` when a page is hidden.

**Group codes.** A facilitator taps "Have a group code?" in the footer and enters a code such as
`LIB-OCT20` or `MS-ENG-P3`. Every event from that device is then tagged with it, so pilot groups
can be compared without collecting names.

**Admin page.** `/admin/stats` is protected by `ADMIN_PASSWORD`. Sign-in uses a signed, httpOnly
cookie (signed with `APP_SECRET`) that lasts 8 hours. The page shows sessions, active time, words
read, choices, the detour cache hit rate, mode, style and book splits, the Create Your Own funnel,
safety redirects, and token usage and cost by kind, day and book. Filter by time range and group
code.

**Feedback.** Set `NEXT_PUBLIC_FEEDBACK_URL` to your survey. If the URL contains `{sessionCode}`,
it's replaced with the device's group code (for example a Google Forms pre-filled field).

## Prompts

All runtime prompts live in `lib/prompts/`, each a documented function that returns
`{system, user, schema, maxTokens, mock}`:

| File                                    | Used for                                                |
| --------------------------------------- | ------------------------------------------------------- |
| `shared.ts`                             | Safety and reading-level rules included in every prompt |
| `detour.ts` + `characterPerspective.ts` | Book adventure detours (canon-anchored)                 |
| `cyoOpening.ts` / `cyoContinuation.ts`  | Create Your Own                                         |
| `choices.ts`                            | Rules for generated choices                             |
| `moderation.ts`                         | The stepper input check                                 |
| `offline.ts`                            | Summaries and adventure maps (content scripts)          |

After changing a detour prompt, bump `PROMPT_VERSION` in `lib/prompts/version.ts` so cached
detours regenerate. `npx tsx --env-file-if-exists=.env.local scripts/analyze-detour-prompts.ts`
reports the size of every possible detour prompt for free (it uses token counting, not
generation).

## Project layout

```
app/              routes (dashboard, /book/[id], /read/[id]/[chapter], /create, /story/[id], api/)
components/       dashboard, reader, ui
content/books/    committed book content (JSON)
lib/content/      chunking, loading and validation of book content
lib/client-store/ localStorage persistence behind the ProgressStore interface
lib/cyo/          Create Your Own genres, Surprise Me and story state
lib/engine/       book adventure state machine, detour cache key and service
lib/safety/       blocklist, personal-info filter, moderation
lib/server-store/ libSQL storage (detour cache, locks, usage, events)
lib/llm/          model provider types, structured-output parsing, pricing
lib/prompts/      prompt templates (offline ones now; runtime ones in Milestone 3)
lib/reader/       reader progress math and preferences
scripts/          offline content scripts
tests/            unit (Vitest) and e2e (Playwright)
```
