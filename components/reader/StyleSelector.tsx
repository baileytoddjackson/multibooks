"use client";

import { useId, useState } from "react";
import type { InteractionStyle } from "@/lib/client-store/types";
import type { Character } from "@/lib/schemas/content";

/** Anyone the reader can play: a book's curated cast member or a Create Your Own character. */
export type PlayableCharacter = Pick<Character, "id" | "name" | "oneLine"> & {
  alsoKnownAs?: string[];
};

/** An alternative name worth showing, e.g. "Ulysses (Odysseus)"; skips "the White Rabbit (White Rabbit)". */
function otherName(c: PlayableCharacter): string | undefined {
  return c.alsoKnownAs?.find((n) => !c.name.toLowerCase().includes(n.toLowerCase()));
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
  characters: PlayableCharacter[];
  initialStyle?: InteractionStyle;
  initialCharacterId?: string;
  onDone: (style: InteractionStyle, characterId?: string) => void;
  heading?: string;
}) {
  const [style, setStyle] = useState<InteractionStyle | undefined>(initialStyle);
  const [characterId, setCharacterId] = useState<string | undefined>(initialCharacterId);
  const needsCharacter = style === "character" || style === "both";
  const canContinue = style && (!needsCharacter || characterId);
  const groupId = useId();
  const choosable = STYLES.filter((s) => s.value === "direct" || characters.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-3 font-display text-xl font-semibold italic">{heading}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {choosable.map((s) => (
            <RadioCard
              key={s.value}
              name={`${groupId}-style`}
              checked={style === s.value}
              onSelect={() => setStyle(s.value)}
              className="min-h-20 gap-1 rounded-2xl p-4"
            >
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm text-[var(--reader-muted)]">{s.blurb}</span>
            </RadioCard>
          ))}
        </div>
      </fieldset>

      {needsCharacter && (
        <fieldset>
          <legend className="mb-2 font-semibold">Who do you want to be?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {characters.map((c) => (
              <RadioCard
                key={c.id}
                name={`${groupId}-character`}
                checked={characterId === c.id}
                onSelect={() => setCharacterId(c.id)}
                className="min-h-14 rounded-xl px-4 py-2"
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
              </RadioCard>
            ))}
          </div>
        </fieldset>
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

/**
 * A card-styled native radio: one Tab stop per group, arrow keys move between options, and
 * screen readers announce "radio button, 2 of 3" with no extra ARIA.
 */
function RadioCard({
  name,
  checked,
  onSelect,
  className,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col items-start text-left ring-2 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plum ${className} ${
        checked
          ? "bg-[var(--reader-accent)]/10 ring-[var(--reader-accent)]"
          : "ring-[var(--reader-line)] hover:ring-[var(--reader-muted)]"
      }`}
    >
      {/* Transparent native radio covering the whole card: real taps/clicks land on it. */}
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[inherit] opacity-0"
      />
      {children}
    </label>
  );
}
