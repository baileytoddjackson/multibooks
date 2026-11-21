"use client";

import { useState } from "react";
import { castAvailableAt } from "@/lib/content/adventureMap";
import { choiceView, type ChoiceView, type PageBlock } from "@/lib/engine/bookAdventure";
import type { InteractionStyle } from "@/lib/client-store/types";
import type { AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import type { Character } from "@/lib/schemas/content";
import { ChoicePrompt } from "./ChoicePrompt";
import { Passage } from "./Passage";
import { StyleSelector } from "./StyleSelector";

export interface EntryChoice {
  option: AdventureOption;
  view: ChoiceView;
  style: InteractionStyle;
  characterId?: string;
}

/** The entry chapter in Adventure Mode: original text, then the choice that starts the adventure. */
export function AdventureBlocks({
  blocks,
  cast,
  onStart,
  onKeepOriginal,
}: {
  blocks: PageBlock[];
  cast: Character[];
  onStart: (choice: EntryChoice) => void;
  onKeepOriginal: () => void;
}) {
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "canon" ? (
          <Passage key={i} paragraphs={b.paragraphs} />
        ) : (
          <EntryChoiceBlock
            key={b.cp.id}
            cp={b.cp}
            cast={cast}
            onStart={onStart}
            onKeepOriginal={onKeepOriginal}
          />
        ),
      )}
    </>
  );
}

function EntryChoiceBlock({
  cp,
  cast,
  onStart,
  onKeepOriginal,
}: {
  cp: ChoicePoint;
  cast: Character[];
  onStart: (choice: EntryChoice) => void;
  onKeepOriginal: () => void;
}) {
  const [style, setStyle] = useState<{ style: InteractionStyle; characterId?: string }>();
  const [starting, setStarting] = useState(false);
  const wrapper =
    "not-prose my-8 rounded-2xl bg-[var(--reader-accent)]/[0.06] p-5 font-sans text-base ring-1 ring-[var(--reader-accent)]/30 sm:p-6";

  // First, how the reader wants to play; then the choice itself.
  if (!style) {
    return (
      <div className={wrapper}>
        <StyleSelector
          characters={castAvailableAt(cast, cp.chapter)}
          onDone={(s, characterId) => setStyle({ style: s, characterId })}
        />
      </div>
    );
  }
  const name = cast.find((c) => c.id === style.characterId)?.name;
  const view = choiceView(cp, style.style, style.characterId, name);
  return (
    <div className={wrapper}>
      <ChoicePrompt
        cp={cp}
        view={view}
        disabled={starting}
        onChoose={(option) => {
          setStarting(true);
          onStart({ option, view, ...style });
        }}
        onKeepOriginal={onKeepOriginal}
      />
    </div>
  );
}
