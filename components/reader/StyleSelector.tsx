"use client";

import { useState } from "react";
import type { InteractionStyle } from "@/lib/client-store/types";
import type { Character } from "@/lib/schemas/content";

/** An alternative name worth showing, e.g. "Ulysses (Odysseus)"; skips "the White Rabbit (White Rabbit)". */
function otherName(c: Character): string | undefined {
  return c.alsoKnownAs.find((n) => !c.name.toLowerCase().includes(n.toLowerCase()));
}

const STYLES: { value: InteractionStyle; title: string; blurb: string }[] = [
  { value: "direct", title: "Direct the story", blurb: "Your choices change what happens next." },
  { value: "character", title: "Be a character", blurb: "See the story through someone's eyes." },
  { value: "both", title: "Both", blurb: "Play as a character and steer the story." },
];

/**
 * The in-story "how do you want to play?" moment shown at the first choice. Written to feel like
 * part of the book, not a settings form. Can be changed later from the adventure menu.
 */
export function StyleSelector({
  characters,
  initialStyle,
  initialCharacterId,
  onDone,
  heading = "Before you choose… how do you want to play?",
}: {
  characters: Character[];
  initialStyle?: InteractionStyle;
  initialCharacterId?: string;
  onDone: (style: InteractionStyle, characterId?: string) => void;
  heading?: string;
}) {
  const [style, setStyle] = useState<InteractionStyle | undefined>(initialStyle);
  const [characterId, setCharacterId] = useState<string | undefined>(initialCharacterId);
  const needsCharacter = style === "character" || style === "both";
  const canContinue = style && (!needsCharacter || characterId);
  const choosable = STYLES.filter((s) => s.value === "direct" || characters.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-display text-xl font-semibold italic">{heading}</p>
      <div
        role="radiogroup"
        aria-label="How do you want to play?"
        className="grid gap-3 sm:grid-cols-3"
      >
        {choosable.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={style === s.value}
            onClick={() => setStyle(s.value)}
            className={`flex min-h-20 flex-col items-start gap-1 rounded-2xl p-4 text-left ring-2 transition-colors ${
              style === s.value
                ? "bg-[var(--reader-accent)]/10 ring-[var(--reader-accent)]"
                : "ring-[var(--reader-line)] hover:ring-[var(--reader-muted)]"
            }`}
          >
            <span className="font-semibold">{s.title}</span>
            <span className="text-sm text-[var(--reader-muted)]">{s.blurb}</span>
          </button>
        ))}
      </div>

      {needsCharacter && (
        <div>
          <p className="mb-2 font-semibold">Who do you want to be?</p>
          <div
            role="radiogroup"
            aria-label="Choose a character"
            className="grid gap-2 sm:grid-cols-2"
          >
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={characterId === c.id}
                onClick={() => setCharacterId(c.id)}
                className={`flex min-h-14 flex-col items-start rounded-xl px-4 py-2 text-left ring-2 ${
                  characterId === c.id
                    ? "bg-[var(--reader-accent)]/10 ring-[var(--reader-accent)]"
                    : "ring-[var(--reader-line)] hover:ring-[var(--reader-muted)]"
                }`}
              >
                <span className="font-semibold capitalize">
                  {c.name}
                  {otherName(c) && (
                    <span className="font-normal text-[var(--reader-muted)]">
                      {" "}
                      ({otherName(c)})
                    </span>
                  )}
                </span>
                <span className="text-sm text-[var(--reader-muted)]">{c.oneLine}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => style && onDone(style, needsCharacter ? characterId : undefined)}
        className="min-h-12 self-start rounded-full bg-plum px-6 font-semibold text-white disabled:opacity-40"
      >
        Let&apos;s go
      </button>
    </div>
  );
}
