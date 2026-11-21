# MultiBooks

A choose-your-own-adventure reading app for middle schoolers (ages ~11–14). Read a classic as
written, turn it into your own adventure (Adventure Mode), or create a story from scratch.

> Status: MVP complete (milestones 1–8). See "Before the pilot" below.

## Quick start

```bash
npm install
cp .env.example .env.local     # works as-is with LLM_PROVIDER=mock (no API key, no cost)
# set SIGNUP_ACCESS_CODE in .env.local, e.g. SIGNUP_ACCESS_CODE=LOCAL
npm run dev                    # http://localhost:3000/signup?code=LOCAL
```

Requires Node 20.9+.

## Accounts and invites

Every page needs a signed-in account. Accounts are email + password, and creating one needs the
shared access code.

- **Invite link:** `https://<your-site>/signup?code=<SIGNUP_ACCESS_CODE>`. The link fills in the
  code, which is then removed from the address bar. The code is checked on the server, ignoring
  case.
- **Rotating the code:** change `SIGNUP_ACCESS_CODE` and redeploy. Existing accounts keep working;
  old invite links stop working. With no code set, sign-up is closed.
- **Forgotten passwords:** there's no email reset yet. An admin can set a new password under
  Accounts on `/admin/stats`, which also signs that reader out everywhere.
- **Sessions** last 30 days: a random token in an httpOnly cookie, stored hashed in
  `auth_sessions`. Passwords are hashed with scrypt. Sign-in and sign-up are limited to
  `AUTH_ATTEMPTS_PER_MINUTE` (default 20) per IP.
- **How pages are protected:** `proxy.ts` sends anyone without a session cookie to `/login` (or
  returns 401 for APIs). Each API route then checks the session against the database
  (`currentUser()` in `lib/auth/session.ts`).
- **What's saved to the account:** reading progress and stories, in the `stories` table, so they
  follow the reader to any device. Text size, theme and the group code stay on the device.
- **Research data stays anonymous.** Events and usage logs keep using a random id that lives only
  on the device and is never stored with the account. Generation limits
  (`PER_SESSION_MAX_GENERATIONS`, rate limits) are counted per account.

## Scripts

| Command                                 | What it does                                                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js dev server, production build, production server                                                                                                                                                                                      |
| `npm run lint` / `typecheck` / `format` | ESLint, `tsc --noEmit`, Prettier                                                                                                                                                                                                             |
| `npm test`                              | Unit tests (Vitest), including validation of all committed content                                                                                                                                                                           |
| `npm run test:e2e`                      | Playwright tests at 390px (iPhone), 820px (iPad) and 1280px, plus axe accessibility scans and a $0-budget server. Each test signs up its own account (`tests/e2e/fixtures.ts`). The first run needs `npx playwright install chromium webkit` |

## Content pipeline

Source texts come from Project Gutenberg and are committed as cleaned JSON. The app never fetches
them at runtime.

```bash
npm run content:fetch          # download raw texts to content/raw (gitignored)
npm run content:chunk          # clean, split chapters/paragraphs/pages → content/books/<id>/chapters + toc.json
npm run content:summaries      # chapter summaries + synopsis via the Batch API → summaries.json
npm run content:maps           # the Adventure Mode entry choice via the Batch API → adventure-map.json
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
- **Adventure maps** hold each book's entry choice: one choice point in the opening chapter, where
  Adventure Mode leaves the original text (see "Adventure Mode" below). Batch results are cached
  by request hash in `data/batches/`, so a re-run after a code fix only pays for changed requests.
- **Summaries** also drive Adventure Mode: the synopsis is the premise, and the chapters' key
  events become the loose storyline an adventure follows.
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
3. Run `content:fetch`, `content:chunk`, `content:summaries`, `content:maps` and
   `content:validate` with `--book <id>`.

## Adventure Mode

Every book can be read two ways: **as written**, or as an **adventure**.

1. The reader reads the book's real opening until its entry choice (`adventure-map.json`), picks
   how to play (direct the story, be a character, or both), and makes a choice. The choice says
   up front that it's one-way.
2. That creates an Adventure Mode story (saved to the account like Create Your Own stories) and
   opens it at `/story/[id]`. From here on every page is generated, and nothing leads back to the
   original text. Undo works within the adventure, but never past its first page.
3. Each page's prompt (`lib/prompts/adventure.ts`) puts **the adventure first**: a running summary
   (150 words or fewer), up to 12 established facts, every choice made, and the last two pages, all
   saved with the story so it can be resumed any time. **The book is the premise**: its synopsis,
   cast, the author's voice, and one "beat" of its storyline as a loose guide
   (`lib/adventure/outline.ts` groups the chapters after the opening into up to 12 beats, paced
   across `ADVENTURE_SOFT_TURN_CAP` pages). The prompt tells the model to borrow the book's big
   moments when they fit and follow the adventure when they don't.
4. `ADVENTURE_SOFT_TURN_CAP` (24) offers "Ready to write the ending?" and
   `ADVENTURE_HARD_TURN_CAP` (30) forces it. A page costs about $0.001 with Haiku 5.5, so a full
   adventure is roughly $0.03.

Like Create Your Own, the server is stateless: the browser sends the saved context with each
request, and the server length-limits and blocklist-checks it before use. Adventures aren't shared
between readers, so every page counts against the budget and rate limits.

## My library

`/library` lists everything a reader has saved: books they're reading as written, their
adventures, and their Create Your Own stories (`lib/library/entries.ts`).

- **Find:** search by title or book (ignoring case and accents), sort by most recent, title or
  book, and filter by book and by kind. Filters live in the URL, so they survive a reload and
  going back from a story.
- **Each entry shows** its kind, source book or genre, progress (% read, or pages so far /
  finished) and when it was last updated, with Resume, Rename (stories) and Delete (asks first;
  for a book read as written it forgets the reader's place).
- The home page keeps "Continue reading" and "My Stories" rows with the six most recent of each,
  linking to the full library.

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
  forces the ending. Stories are saved to the reader's account under My Stories.

## Cost controls and limits

Every new generation goes through `guardGeneration` (`lib/budget/budget.ts`). Reading as written
never does, so it keeps working when a limit is hit.

| Setting                                               | Default     | What happens when it's reached                                                                                             |
| ----------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DAILY_BUDGET_USD`                                    | `5`         | All new generation pauses until midnight UTC; readers see "The story machine is resting" and can keep reading the original |
| `PER_SESSION_MAX_GENERATIONS`                         | `40`        | Same message, for that account only                                                                                        |
| `RATE_LIMIT_SESSION_PER_MINUTE`                       | `8`         | A short "Lots of readers are adventuring right now…" pause, then an automatic retry                                        |
| `RATE_LIMIT_IP_PER_MINUTE`                            | `150`       | Same. Kept generous because a whole classroom usually shares one public IP                                                 |
| `CYO_SOFT_TURN_CAP` / `CYO_HARD_TURN_CAP`             | `20` / `25` | "Ready to write the ending?" / the ending is written                                                                       |
| `ADVENTURE_SOFT_TURN_CAP` / `ADVENTURE_HARD_TURN_CAP` | `24` / `30` | The same, for Adventure Mode                                                                                               |

Spend is estimated from the token usage the API reports for every call, including failed ones,
using `lib/llm/pricing.ts`. IP addresses are never stored: rate limiting uses a salted hash that
changes daily. At Haiku 5.5 prices, $5 a day covers roughly 7,000–10,000 new passages.

## Research instrumentation and admin stats

**Events.** The app records anonymous events defined in `lib/analytics/events.ts`:

- books selected, reading mode chosen and interaction style chosen;
- choices made, adventures started and finished, undos;
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
read, choices, adventures started and finished, mode, style and book splits, the Create Your Own funnel,
safety redirects, and token usage and cost by kind, day and book. Filter by time range and group
code.

**Feedback.** Set `NEXT_PUBLIC_FEEDBACK_URL` to your survey. If the URL contains `{sessionCode}`,
it's replaced with the device's group code (for example a Google Forms pre-filled field).

## Prompts

All runtime prompts live in `lib/prompts/`, each a documented function that returns
`{system, user, schema, maxTokens, mock}`:

| File                                       | Used for                                                |
| ------------------------------------------ | ------------------------------------------------------- |
| `shared.ts`                                | Safety and reading-level rules included in every prompt |
| `adventure.ts` + `characterPerspective.ts` | Adventure Mode (opening and each page after)            |
| `cyoOpening.ts` / `cyoContinuation.ts`     | Create Your Own                                         |
| `choices.ts`                               | Rules for generated choices                             |
| `moderation.ts`                            | The stepper input check                                 |
| `offline.ts`                               | Summaries and adventure maps (content scripts)          |

## Deploying (Vercel + Supabase)

1. **Database (Supabase).** Create a project. In **Connect**, copy the **Transaction pooler**
   connection string (port `6543`) and fill in your database password. That's `DATABASE_URL`.
   - Tables are created automatically on first use, in the `public` schema with Row Level
     Security on and no policies. Supabase's public REST and GraphQL APIs can't read them; only
     the app's direct connection can.
   - Storage is chosen from the URL: `postgres://` / `postgresql://` → Postgres, `file:` →
     SQLite, `libsql://` → Turso. Local development and the tests use SQLite.
2. **Vercel.** Import the repository and set these environment variables (Production and Preview):

   | Variable                                                    | Value                                                                     |
   | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
   | `ANTHROPIC_API_KEY`                                         | A key from console.anthropic.com (set a monthly spend limit there too)    |
   | `LLM_PROVIDER`                                              | `anthropic`                                                               |
   | `MODEL_RUNTIME`, `MODEL_OFFLINE`                            | `claude-haiku-5-5`                                                        |
   | `DATABASE_URL`                                              | The Supabase transaction pooler string from step 1                        |
   | `DAILY_BUDGET_USD`, `PER_SESSION_MAX_GENERATIONS`           | e.g. `5`, `40`                                                            |
   | `RATE_LIMIT_SESSION_PER_MINUTE`, `RATE_LIMIT_IP_PER_MINUTE` | `8`, `150`                                                                |
   | `CYO_SOFT_TURN_CAP`, `CYO_HARD_TURN_CAP`                    | `20`, `25`                                                                |
   | `ADMIN_PASSWORD`                                            | A strong password for `/admin/stats`                                      |
   | `APP_SECRET`                                                | A long random string, e.g. `openssl rand -base64 32`                      |
   | `SIGNUP_ACCESS_CODE`                                        | The shared code in invite links (see "Accounts and invites")              |
   | `NEXT_PUBLIC_FEEDBACK_URL`                                  | Your survey link (rebuild after changing it: it's baked in at build time) |

3. **Region.** `vercel.json` runs the server code in `pdx1` (Portland), next to a Supabase
   project in US West (Oregon). If your Supabase project is elsewhere, change it to the nearest
   [Vercel region](https://vercel.com/docs/edge-network/regions).
4. **Deploy.** Book content is read from the deployment's files (`outputFileTracingIncludes` in
   `next.config.ts`), and generated pages stream over normal serverless functions.

## Before the pilot

- [ ] Rotate the Anthropic API key, and set a monthly spend limit in the Console.
- [ ] Set `ADMIN_PASSWORD` and `APP_SECRET`. The admin page warns while the default is in use.
- [ ] Set `SIGNUP_ACCESS_CODE` and send testers `https://<your-site>/signup?code=<code>`.
- [ ] Review each book's entry choice (`content/books/*/adventure-map.json`) and the character
      profiles in `content/books/*/characters.json`.
- [ ] Decide on `DAILY_BUDGET_USD`. At Haiku 5.5 prices, $5 covers roughly 7,000–10,000 new
      passages.
- [ ] Set `NEXT_PUBLIC_FEEDBACK_URL`, and give each group a code (e.g. `LIB-OCT20`, `MS-ENG-P3`) to
      enter under "Have a group code?".
- [ ] Try it on an iPad: one book in each mode, plus a Create Your Own story.
- [ ] Run `npm test` and `npm run test:e2e`.

## Project layout

```
app/              routes (dashboard, /book/[id], /read/[id]/[chapter], /create, /story/[id], api/)
components/       dashboard, reader, ui
content/books/    committed book content (JSON)
lib/content/      chunking, loading and validation of book content
lib/auth/         accounts, sessions, access code, password hashing
lib/client-store/ client store: account data synced with /api/me, device data in localStorage
lib/adventure/    Adventure Mode: book context, storyline outline, new-adventure records
lib/cyo/          Create Your Own genres, Surprise Me, and story state (shared with adventures)
lib/engine/       where Adventure Mode leaves a book (entry choice, page layout)
lib/safety/       blocklist, personal-info filter, moderation
lib/server-store/ shared SQL storage (accounts, stories, usage, events) for SQLite and Postgres
lib/llm/          model provider types, structured-output parsing, pricing
lib/prompts/      prompt templates (runtime and offline)
lib/reader/       reader progress math and preferences
scripts/          offline content scripts
tests/            unit (Vitest) and e2e (Playwright)
```
