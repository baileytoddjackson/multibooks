"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { getStore, notifyStoreChanged } from "@/lib/client-store";
import { DETAILS_MAX, GENRES, SETTING_MAX, surpriseSetting, type GenreId } from "@/lib/cyo/genres";
import { createStory, type OpeningResult } from "@/lib/cyo/story";
import { postSse } from "@/lib/http/sseClient";
import { SLOW_DOWN_NOTE } from "@/lib/reader/useDetour";

type StartEvent =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | ({ type: "ready" } & OpeningResult)
  | { type: "redirect"; reason: string; suggestions: string[] }
  | { type: "denied"; reason: string; retryAfterSec?: number }
  | { type: "error"; code: string };

const STEPS = ["Pick a genre", "Choose a setting", "Add details"] as const;

const REDIRECT_COPY: Record<string, string> = {
  personal_info:
    "Let's keep real names, schools and addresses out of the story. Try made-up ones instead!",
  default: "Hmm, the storyteller wants to try a different idea. How about one of these?",
};

const DETAIL_EXAMPLES = [
  "A hero named Juno who can talk to birds",
  "A best friend who is secretly a robot",
  "They need to find a lost map before sunset",
];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function Stepper() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [genre, setGenre] = useState<GenreId | undefined>();
  const [setting, setSetting] = useState("");
  const [recentSurprises, setRecentSurprises] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [phase, setPhase] = useState<"form" | "writing" | "error" | "resting">("form");
  const [streamText, setStreamText] = useState("");
  const [redirect, setRedirect] = useState<{ message: string; suggestions: string[] } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settingId = useId();
  const detailsId = useId();

  const go = (n: number) => {
    setStep(n);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const surprise = () => {
    if (!genre) return;
    const pick = surpriseSetting(genre, recentSurprises);
    setSetting(pick);
    setRecentSurprises((r) => [...r.slice(-10), pick]);
  };

  const [note, setNote] = useState<string | undefined>();

  const start = async (attempt = 0) => {
    if (!genre) return;
    setNote(undefined);
    setPhase("writing");
    setStreamText("");
    setRedirect(null);
    const sessionId = getStore().getSession().anonId;
    const input = { genre, setting: setting.trim(), details: details.trim() || undefined };
    let text = "";
    let done = false;
    try {
      await postSse<StartEvent>("/api/cyo/start", { ...input, sessionId }, (ev) => {
        if (ev.type === "delta") setStreamText((text += ev.text));
        else if (ev.type === "reset") setStreamText((text = ""));
        else if (ev.type === "ready") {
          done = true;
          const story = createStory(newId(), input, ev);
          getStore().saveStory(story);
          notifyStoreChanged();
          router.replace(`/story/${story.id}`);
        } else if (ev.type === "redirect") {
          done = true;
          setRedirect({
            message: REDIRECT_COPY[ev.reason] ?? REDIRECT_COPY.default,
            suggestions: ev.suggestions,
          });
          setPhase("form");
          go(1);
        } else if (ev.type === "denied" && ev.reason === "rate_limited" && attempt < 2) {
          done = true;
          setNote(SLOW_DOWN_NOTE);
          setTimeout(() => start(attempt + 1), Math.min(ev.retryAfterSec ?? 10, 30) * 1000);
        } else if (ev.type === "denied") {
          done = true;
          setPhase("resting");
        } else if (ev.type === "error") {
          done = true;
          setPhase("error");
        }
      });
      if (!done) setPhase("error");
    } catch {
      setPhase("error");
    }
  };

  if (phase !== "form") {
    return (
      <div className="paper-grain mx-auto max-w-[48rem] rounded-[var(--radius-card)] bg-card px-6 py-10 shadow-[var(--shadow-page)] ring-1 ring-line sm:px-14">
        {phase === "writing" && (
          <div aria-live="polite" aria-busy="true">
            <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-plum uppercase">
              ✦ Your story is being written
            </p>
            {streamText ? (
              <div className="prose-book">
                {streamText.split(/\n\s*\n/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="text-ink-soft">{note ?? "Gathering ideas, sharpening pencils…"}</p>
            )}
          </div>
        )}
        {phase === "error" && (
          <div role="alert" className="text-center">
            <p className="font-display text-2xl font-semibold">The story got tangled up.</p>
            <p className="mt-2 text-ink-soft">That one&apos;s on us. Let&apos;s try again.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => start()}
                className="min-h-12 rounded-full bg-plum px-6 font-semibold text-white"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="min-h-12 rounded-full px-6 font-semibold ring-2 ring-line"
              >
                Change my idea
              </button>
            </div>
          </div>
        )}
        {phase === "resting" && (
          <div role="status" className="text-center">
            <p className="font-display text-2xl font-semibold">The story machine is resting.</p>
            <p className="mt-2 text-ink-soft">
              It has written a lot of stories today! Come back tomorrow, or read one of the books in
              the library.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex min-h-12 items-center rounded-full bg-teal px-6 font-semibold text-white"
            >
              Back to the library
            </Link>
          </div>
        )}
      </div>
    );
  }

  const canNext = step === 0 ? !!genre : step === 1 ? setting.trim().length >= 3 : true;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress */}
      <div className="mb-6">
        <p className="mb-2 text-sm font-semibold text-ink-soft">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-paper-deep"
          role="progressbar"
          aria-label="Story setup progress"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        >
          <div
            className="h-full rounded-full bg-coral transition-[width] duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] bg-card p-6 shadow-[var(--shadow-page)] ring-1 ring-line sm:p-8">
        {step === 0 && (
          <fieldset>
            <legend>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-3xl font-semibold focus:outline-none"
              >
                What kind of story do you want to tell?
              </h1>
            </legend>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {GENRES.map((g) => (
                <label
                  key={g.id}
                  className={`relative flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plum ${
                    genre === g.id ? "bg-paper-deep ring-ink" : "ring-line hover:ring-ink/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="genre"
                    value={g.id}
                    checked={genre === g.id}
                    onChange={() => setGenre(g.id)}
                    className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[inherit] opacity-0"
                  />
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded-full"
                    style={{ background: g.color }}
                  />
                  <span className="flex flex-col">
                    <span className="font-semibold">{g.label}</span>
                    <span className="text-sm text-ink-soft">{g.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-3xl font-semibold focus:outline-none"
            >
              Where does your story happen?
            </h1>
            <p className="mt-2 text-ink-soft">
              Describe a place in a few words, or let us surprise you.
            </p>
            {redirect && (
              <div role="status" className="mt-4 rounded-2xl bg-[#FBEBC6] p-4 text-[#5B3D00]">
                <p className="font-semibold">{redirect.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {redirect.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSetting(s);
                        setRedirect(null);
                      }}
                      className="min-h-11 rounded-full bg-white px-4 text-left text-sm font-semibold ring-1 ring-[#E9C77A]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label htmlFor={settingId} className="mt-5 block font-semibold">
              Setting
            </label>
            <textarea
              id={settingId}
              value={setting}
              onChange={(e) => setSetting(e.target.value.slice(0, SETTING_MAX))}
              maxLength={SETTING_MAX}
              rows={2}
              placeholder="e.g. A lighthouse made of glass on a stormy island"
              className="mt-2 w-full resize-none rounded-2xl border-2 border-line bg-paper px-4 py-3 text-lg"
              aria-describedby={`${settingId}-count`}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={surprise}
                className="min-h-11 rounded-full bg-marigold px-5 font-semibold text-ink"
              >
                ✦ {recentSurprises.length ? "Surprise me again" : "Surprise me"}
              </button>
              <span id={`${settingId}-count`} className="text-sm text-ink-soft">
                {setting.length}/{SETTING_MAX}
              </span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-3xl font-semibold focus:outline-none"
            >
              Anything else? <span className="text-ink-soft">(optional)</span>
            </h1>
            <p className="mt-2 text-ink-soft">
              Add characters, a goal, or a feeling. Or skip this and let the story surprise you.
            </p>
            <label htmlFor={detailsId} className="mt-5 block font-semibold">
              Extra details
            </label>
            <textarea
              id={detailsId}
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, DETAILS_MAX))}
              maxLength={DETAILS_MAX}
              rows={3}
              placeholder={DETAIL_EXAMPLES.join("\n")}
              className="mt-2 w-full resize-none rounded-2xl border-2 border-line bg-paper px-4 py-3"
              aria-describedby={`${detailsId}-hint`}
            />
            <p id={`${detailsId}-hint`} className="mt-1 text-right text-sm text-ink-soft">
              Use made-up names. {details.length}/{DETAILS_MAX}
            </p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="min-h-12 rounded-full px-5 font-semibold ring-2 ring-line"
            >
              ← Back
            </button>
          ) : (
            <Link
              href="/"
              className="min-h-12 content-center rounded-full px-5 font-semibold ring-2 ring-line"
            >
              ← Library
            </Link>
          )}
          {step < 2 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => go(step + 1)}
              className="min-h-12 rounded-full bg-coral-strong px-6 font-semibold text-white disabled:opacity-40"
            >
              Next →
            </button>
          ) : (
            <div className="flex gap-2">
              {!details.trim() && (
                <button
                  type="button"
                  onClick={() => start()}
                  className="min-h-12 rounded-full px-5 font-semibold ring-2 ring-line"
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={() => start()}
                className="min-h-12 rounded-full bg-plum px-6 font-semibold text-white"
              >
                Start my story ✦
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
