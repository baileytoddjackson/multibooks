"use client";

import type { ChoiceView } from "@/lib/engine/bookAdventure";
import type { AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";

/** The inline "What would you like to do next?" moment, styled as part of the page. */
export function ChoicePrompt({
  cp,
  view,
  onChoose,
  onKeepOriginal,
}: {
  cp: ChoicePoint;
  view: ChoiceView;
  onChoose: (option: AdventureOption) => void;
  onKeepOriginal: () => void;
}) {
  const headingId = `choice-${cp.id}`;
  return (
    <section
      aria-labelledby={headingId}
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
              onClick={() => onChoose(o)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-[var(--reader-bg)] px-4 py-3 text-left font-reading text-[1.05em] ring-2 ring-[var(--reader-line)] transition-colors hover:ring-[var(--reader-accent)]"
            >
              <span aria-hidden="true" className="text-[var(--reader-accent)]">
                ✦
              </span>
              {o.label}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onKeepOriginal}
        className="min-h-11 self-start rounded-lg px-2 text-sm font-semibold text-[var(--reader-muted)] underline-offset-4 hover:underline"
      >
        Keep reading the original instead
      </button>
    </section>
  );
}
