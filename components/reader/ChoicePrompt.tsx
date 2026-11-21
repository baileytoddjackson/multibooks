"use client";

import type { ChoiceView } from "@/lib/engine/bookAdventure";
import type { AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";

/**
 * The inline moment where Adventure Mode leaves the book, styled as part of the page. Choosing is
 * one-way, so the prompt says so before the reader picks.
 */
export function ChoicePrompt({
  cp,
  view,
  disabled,
  onChoose,
  onKeepOriginal,
}: {
  cp: ChoicePoint;
  view: ChoiceView;
  disabled?: boolean;
  onChoose: (option: AdventureOption) => void;
  onKeepOriginal: () => void;
}) {
  const headingId = `choice-${cp.id}`;
  const noteId = `choice-note-${cp.id}`;
  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={noteId}
      className="flex flex-col gap-3"
      data-testid="choice-prompt"
    >
      <h2 id={headingId} className="font-display text-xl leading-snug font-semibold italic">
        {cp.prompt}
      </h2>
      {view.narratorFallbackNote && (
        <p className="text-sm text-[var(--reader-muted)]">{view.narratorFallbackNote}</p>
      )}
      <ul className="flex flex-col gap-2">
        {view.options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(o)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-[var(--reader-bg)] px-4 py-3 text-left font-reading text-[1.05em] ring-2 ring-[var(--reader-line)] transition-colors hover:ring-[var(--reader-accent)] disabled:opacity-60"
            >
              <span aria-hidden="true" className="text-[var(--reader-accent)]">
                ✦
              </span>
              {o.label}
            </button>
          </li>
        ))}
      </ul>
      <p id={noteId} className="text-sm text-[var(--reader-muted)]">
        From here the story is yours: it follows the book loosely, but it won&apos;t go back to the
        original text.
      </p>
      <button
        type="button"
        onClick={onKeepOriginal}
        className="min-h-11 self-start rounded-lg px-2 text-sm font-semibold text-[var(--reader-muted)] underline-offset-4 hover:underline"
      >
        Read the original instead
      </button>
    </section>
  );
}
