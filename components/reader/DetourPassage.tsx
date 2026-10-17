"use client";

import type { ReactNode } from "react";
import { cleanGeneratedText as smartQuotes } from "@/lib/text/clean";
import type { DetourStatus } from "@/lib/reader/useDetour";

/**
 * A generated passage, marked with a small "Your adventure" ribbon and a tinted rule so readers
 * can always tell what the author wrote and what was written for their choice.
 */
export function DetourPassage({
  choiceLabel,
  status,
  segments,
  note,
  onRetry,
  onReturnToOriginal,
  onUndo,
}: {
  choiceLabel: string;
  status: DetourStatus;
  /** Saved segments (when the detour was already written). */
  segments: string[];
  note?: string;
  onRetry: () => void;
  onReturnToOriginal: () => void;
  onUndo: () => void;
}) {
  const ready = segments.length > 0;
  let body: ReactNode;

  if (ready) {
    body = smartQuotes(segments.join("\n\n"))
      .split(/\n\s*\n/)
      .map((p, i) => <p key={i}>{p}</p>);
  } else if (status.state === "loading") {
    body = (
      <>
        {status.text ? (
          smartQuotes(status.text)
            .split(/\n\s*\n/)
            .map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <WritingIndicator
            label={
              status.note ??
              (status.waitingForOthers
                ? "Another reader is writing this part. Almost there…"
                : undefined)
            }
          />
        )}
        {status.text && <WritingIndicator compact />}
      </>
    );
  } else if (status.state === "resting") {
    body = (
      <div role="status" className="font-sans">
        <p className="font-semibold">The story machine is resting for today.</p>
        <p className="mt-1 text-[var(--reader-muted)]">
          New adventure paths will be back tomorrow. You can keep reading the original story now.
        </p>
        <button
          type="button"
          onClick={onReturnToOriginal}
          className="mt-3 min-h-11 rounded-full bg-teal px-5 font-semibold text-white"
        >
          Read the original instead
        </button>
      </div>
    );
  } else if (status.state === "error") {
    body = (
      <div role="alert" className="font-sans">
        <p className="font-semibold">Hmm, this part of the adventure got lost on the way.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-full bg-plum px-5 font-semibold text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onReturnToOriginal}
            className="min-h-11 rounded-full px-5 font-semibold ring-2 ring-[var(--reader-line)]"
          >
            Read the original instead
          </button>
        </div>
      </div>
    );
  } else {
    body = <WritingIndicator />;
  }

  return (
    <section
      aria-label="Your adventure"
      aria-busy={!ready && status.state === "loading"}
      className="relative my-6 border-l-4 border-[var(--reader-accent)]/60 pl-5 sm:-ml-6 sm:pl-6"
      data-testid="detour"
    >
      <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-[var(--reader-accent)] uppercase">
        <span aria-hidden="true">✦ </span>Your adventure
        <span className="sr-only">: written for your choice, not by the author.</span>
      </p>
      <p className="mb-3 font-sans text-sm text-[var(--reader-muted)] italic">
        You chose: {choiceLabel}
      </p>
      {note && <p className="mb-3 font-sans text-sm text-[var(--reader-muted)]">{note}</p>}
      <div>{body}</div>
      {ready && (
        <div className="mt-5 flex flex-wrap gap-2 font-sans text-sm">
          <button
            type="button"
            onClick={onUndo}
            className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)]"
          >
            ↺ Go back one choice
          </button>
          <button
            type="button"
            onClick={onReturnToOriginal}
            className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)]"
          >
            Return to the original story
          </button>
        </div>
      )}
      {ready && (
        <p className="mt-6 text-center font-sans text-xs tracking-[0.18em] text-[var(--reader-muted)] uppercase">
          The original story continues
        </p>
      )}
    </section>
  );
}

function WritingIndicator({ label, compact }: { label?: string; compact?: boolean }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 font-sans text-sm text-[var(--reader-muted)]"
    >
      <span className="inline-flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--reader-accent)] motion-reduce:animate-none"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {!compact && (label ?? "The story is being written…")}
      {compact && <span className="sr-only">Still writing…</span>}
    </p>
  );
}
