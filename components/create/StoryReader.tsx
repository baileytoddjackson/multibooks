"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReaderControls } from "@/components/reader/ReaderControls";
import { StyleSelector } from "@/components/reader/StyleSelector";
import { FeedbackLink } from "@/components/ui/FeedbackLink";
import { getStore, notifyStoreChanged, useStoreVersion } from "@/lib/client-store";
import type { CyoStory } from "@/lib/client-store/types";
import { genreLabel } from "@/lib/cyo/genres";
import {
  appendSegment,
  canUndo,
  lastSegment,
  mustOfferChoices,
  renameStory,
  setStoryStyle,
  turn,
  undoLastChoice,
  wrapUpState,
  type ContinuationResult,
} from "@/lib/cyo/story";
import { track, wordsIn } from "@/lib/analytics/track";
import { postSse } from "@/lib/http/sseClient";
import { SLOW_DOWN_NOTE } from "@/lib/reader/useDetour";
import { useReaderPrefs } from "@/lib/reader/usePrefs";

type ContinueEvent =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | ({ type: "ready" } & ContinuationResult)
  | { type: "denied"; reason: string; retryAfterSec?: number }
  | { type: "error"; code: string };

type Live =
  | { state: "idle" }
  | { state: "writing"; choice?: string; text: string; note?: string }
  | { state: "error"; retry: () => void }
  | { state: "resting" };

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

export function StoryReader({
  storyId,
  softCap,
  hardCap,
}: {
  storyId: string;
  softCap: number;
  hardCap: number;
}) {
  const version = useStoreVersion();
  const [prefs, setPrefs] = useReaderPrefs();
  const [live, setLive] = useState<Live>({ state: "idle" });
  const [dismissedWrapUpAt, setDismissedWrapUpAt] = useState(-1);
  const [editingTitle, setEditingTitle] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const newSegmentRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const story = version >= 0 ? getStore().getStory(storyId) : undefined;
  const count = story?.segments.length ?? 0;

  // When a new segment lands, bring its start into view and move focus there for screen readers.
  useEffect(() => {
    if (prevCount.current && count > prevCount.current) {
      newSegmentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      newSegmentRef.current?.focus({ preventScroll: true });
    }
    prevCount.current = count;
  }, [count]);

  if (version < 0) return <div className="min-h-dvh bg-paper" aria-busy="true" />;
  if (!story) {
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-display text-2xl font-semibold">We couldn&apos;t find that story.</p>
        <p className="mt-2 text-ink-soft">
          Stories are saved on this device. Want to start a new one?
        </p>
        <Link
          href="/create"
          className="mt-5 inline-flex min-h-12 items-center rounded-full bg-plum px-6 font-semibold text-white"
        >
          Create a story
        </Link>
      </main>
    );
  }

  const save = (next: CyoStory) => {
    getStore().saveStory(next);
    notifyStoreChanged();
  };

  const continueStory = (choice: string | undefined, wantEnding = false, attempt = 0) => {
    const s = story;
    const last = lastSegment(s);
    if (attempt === 0) {
      // The segment the reader just finished counts as read.
      track("words_read", { context: "cyo", words: Math.min(wordsIn(last.text), 5000) });
      if (choice) track("choice_made", { context: "cyo", turn: turn(s) });
    }
    const character = s.cast.find((c) => c.id === s.characterId);
    setLive({ state: "writing", choice, text: "" });
    requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );
    let text = "";
    let done = false;
    const retry = () => continueStory(choice, wantEnding);
    postSse<ContinueEvent>(
      "/api/cyo/continue",
      {
        genre: s.genre,
        summary: last.summary,
        lastSegment: last.text,
        choice,
        style: s.style,
        character: character ? { name: character.name, oneLine: character.oneLine } : undefined,
        mustOfferChoices: mustOfferChoices(s),
        wantEnding,
        turn: turn(s) + 1,
        sessionId: getStore().getSession().anonId,
      },
      (ev) => {
        if (ev.type === "delta") setLive({ state: "writing", choice, text: (text += ev.text) });
        else if (ev.type === "reset") setLive({ state: "writing", choice, text: (text = "") });
        else if (ev.type === "ready") {
          done = true;
          const next = appendSegment(s, choice, ev);
          if (next.status === "done") {
            track("story_finished", { genre: s.genre, turns: turn(next) });
            track("words_read", { context: "cyo", words: Math.min(wordsIn(ev.story), 5000) });
          }
          save(next);
          setLive({ state: "idle" });
        } else if (ev.type === "denied" && ev.reason === "rate_limited" && attempt < 2) {
          // Too many new pages this minute: wait politely, then try again by itself.
          done = true;
          setLive({ state: "writing", choice, text: "", note: SLOW_DOWN_NOTE });
          setTimeout(
            () => continueStory(choice, wantEnding, attempt + 1),
            Math.min(ev.retryAfterSec ?? 10, 30) * 1000,
          );
        } else if (ev.type === "denied") {
          done = true;
          track("generation_blocked", {
            context: "cyo",
            reason: ev.reason === "session_limit" ? "session_limit" : "daily_budget",
          });
          setLive({ state: "resting" });
        } else {
          done = true;
          track("error_shown", { context: "cyo", code: "continue_failed" });
          setLive({ state: "error", retry });
        }
      },
    )
      .then(() => {
        if (!done) setLive({ state: "error", retry });
      })
      .catch(() => setLive({ state: "error", retry }));
  };

  const last = lastSegment(story);
  const wrap = wrapUpState(story, softCap, hardCap);
  const busy = live.state === "writing";
  const ended = story.status === "done";
  const needsStyle = !story.style && !ended;
  const showWrapOffer = wrap === "offer" && dismissedWrapUpAt !== count;

  return (
    <div
      data-theme={prefs.theme}
      data-font-size={prefs.fontSize}
      className="flex min-h-dvh flex-col bg-[var(--reader-bg)] text-[var(--reader-text)]"
    >
      <header className="sticky top-0 z-20 bg-[var(--reader-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-2 py-1 sm:px-4">
          <Link
            href="/"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 font-semibold hover:bg-[var(--reader-line)]"
          >
            <span aria-hidden="true">←</span>
            <span className="sr-only sm:not-sr-only sm:ml-2">Library</span>
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate font-display font-semibold">{story.title}</p>
            <p className="truncate text-sm text-[var(--reader-muted)]">
              My story · {genreLabel(story.genre)} · Part {turn(story)}
            </p>
          </div>
          <ReaderControls prefs={prefs} onChange={setPrefs} />
        </div>
      </header>

      <main id="main" className="flex-1 px-2 py-4 sm:px-6 sm:py-10">
        <article className="paper-grain mx-auto max-w-[48rem] rounded-[var(--radius-card)] bg-[var(--reader-page)] px-5 py-8 shadow-[var(--shadow-page)] ring-1 ring-[var(--reader-line)] sm:px-14 sm:py-14">
          <header className="mb-8 text-center">
            <p className="text-xs font-semibold tracking-[0.2em] text-[var(--reader-accent)] uppercase">
              ✦ A story by you
            </p>
            {editingTitle ? (
              <form
                className="mt-3 flex flex-wrap items-center justify-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get("title");
                  save(renameStory(story, String(value ?? "")));
                  setEditingTitle(false);
                }}
              >
                <label htmlFor="story-title" className="sr-only">
                  Story title
                </label>
                <input
                  id="story-title"
                  name="title"
                  defaultValue={story.title}
                  maxLength={80}
                  autoFocus
                  className="min-h-12 w-full max-w-md rounded-xl border-2 border-[var(--reader-line)] bg-[var(--reader-bg)] px-3 text-center font-display text-2xl"
                />
                <button
                  type="submit"
                  className="min-h-11 rounded-full bg-plum px-5 font-semibold text-white"
                >
                  Save
                </button>
              </form>
            ) : (
              <div className="mt-2 flex items-center justify-center gap-2">
                <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">
                  {story.title}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="min-h-11 min-w-11 rounded-full text-[var(--reader-muted)] hover:bg-[var(--reader-line)]"
                >
                  <span aria-hidden="true">✎</span>
                  <span className="sr-only">Edit title</span>
                </button>
              </div>
            )}
          </header>

          <div className="prose-book mx-auto">
            {story.segments.map((seg, i) => (
              <div
                key={i}
                ref={i === count - 1 ? newSegmentRef : undefined}
                tabIndex={-1}
                className="focus-visible:outline-none"
              >
                {i > 0 && (
                  <p className="my-6 text-center font-sans text-sm text-[var(--reader-muted)] italic">
                    {seg.choiceMade ? `You chose: ${seg.choiceMade}` : "⁂"}
                  </p>
                )}
                <Paragraphs text={seg.text} />
              </div>
            ))}

            {live.state === "writing" && (
              <div aria-live="polite" aria-busy="true">
                {live.choice && (
                  <p className="my-6 text-center font-sans text-sm text-[var(--reader-muted)] italic">
                    You chose: {live.choice}
                  </p>
                )}
                {live.text ? <Paragraphs text={live.text} /> : null}
                <p role="status" className="mt-4 font-sans text-sm text-[var(--reader-muted)]">
                  ✦ {live.note ?? "The story is being written…"}
                </p>
              </div>
            )}
          </div>

          <div ref={endRef} className="mt-10 font-sans">
            {live.state === "error" && (
              <div
                role="alert"
                className="rounded-2xl p-5 text-center ring-1 ring-[var(--reader-line)]"
              >
                <p className="font-semibold">Hmm, the next page got lost on the way.</p>
                <button
                  type="button"
                  onClick={live.retry}
                  className="mt-3 min-h-11 rounded-full bg-plum px-5 font-semibold text-white"
                >
                  Try again
                </button>
              </div>
            )}
            {live.state === "resting" && (
              <div
                role="status"
                className="rounded-2xl p-5 text-center ring-1 ring-[var(--reader-line)]"
              >
                <p className="font-semibold">The story machine is resting for today.</p>
                <p className="mt-1 text-[var(--reader-muted)]">
                  Your story is saved. Come back tomorrow to keep going!
                </p>
              </div>
            )}

            {!busy && ended && (
              <div className="text-center">
                <p className="font-display text-3xl font-semibold">The End</p>
                <p className="mt-2 text-[var(--reader-muted)]">
                  What a story! It&apos;s saved in My Stories.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/create"
                    className="inline-flex min-h-12 items-center rounded-full bg-plum px-6 font-semibold text-white"
                  >
                    Write another story
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex min-h-12 items-center rounded-full px-6 font-semibold ring-2 ring-[var(--reader-line)]"
                  >
                    Back to the library
                  </Link>
                </div>
              </div>
            )}

            {!busy && !ended && live.state !== "resting" && (
              <div className="rounded-2xl bg-[var(--reader-accent)]/[0.06] p-5 ring-1 ring-[var(--reader-accent)]/30 sm:p-6">
                {needsStyle ? (
                  <StyleSelector
                    heading="Before you choose… how do you want to play?"
                    characters={story.cast}
                    onDone={(style, characterId) => {
                      track("style_chosen", { context: "cyo", style });
                      save(setStoryStyle(story, style, characterId));
                    }}
                  />
                ) : wrap === "forced" ? (
                  <div className="text-center">
                    <p className="font-display text-xl font-semibold italic">
                      It&apos;s time for the big finish!
                    </p>
                    <button
                      type="button"
                      onClick={() => continueStory(undefined, true)}
                      className="mt-3 min-h-12 rounded-full bg-plum px-6 font-semibold text-white"
                    >
                      Write the ending ✦
                    </button>
                  </div>
                ) : showWrapOffer ? (
                  <div className="text-center" data-testid="wrap-up">
                    <p className="font-display text-xl font-semibold italic">
                      Ready to write the ending?
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => continueStory(undefined, true)}
                        className="min-h-12 rounded-full bg-plum px-6 font-semibold text-white"
                      >
                        Write the ending
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedWrapUpAt(count)}
                        className="min-h-12 rounded-full px-6 font-semibold ring-2 ring-[var(--reader-line)]"
                      >
                        Keep going
                      </button>
                    </div>
                  </div>
                ) : last.choices.length > 0 ? (
                  <section aria-labelledby="next-choice" data-testid="cyo-choices">
                    <h2 id="next-choice" className="font-display text-xl font-semibold italic">
                      What should happen next?
                    </h2>
                    <ul className="mt-3 flex flex-col gap-2">
                      {last.choices.map((c) => (
                        <li key={c}>
                          <button
                            type="button"
                            onClick={() => continueStory(c)}
                            className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-[var(--reader-bg)] px-4 py-3 text-left font-reading ring-2 ring-[var(--reader-line)] hover:ring-[var(--reader-accent)]"
                          >
                            <span aria-hidden="true" className="text-[var(--reader-accent)]">
                              ✦
                            </span>
                            {c}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => continueStory(undefined)}
                      className="min-h-12 rounded-full bg-teal px-6 font-semibold text-white"
                    >
                      Keep reading →
                    </button>
                  </div>
                )}
              </div>
            )}

            {!busy && canUndo(story) && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    track("undo", { context: "cyo" });
                    save(undoLastChoice(story));
                  }}
                  className="min-h-11 rounded-full px-4 text-sm font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)]"
                >
                  ↺ Go back one choice
                </button>
              </div>
            )}
          </div>
        </article>
      </main>

      <footer className="flex justify-center pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <FeedbackLink className="text-sm text-[var(--reader-accent)]" />
      </footer>
    </div>
  );
}
