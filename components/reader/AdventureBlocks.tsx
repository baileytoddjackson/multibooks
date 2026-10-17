"use client";

import { useEffect } from "react";
import { castAvailableAt } from "@/lib/content/adventureMap";
import {
  choiceView,
  type AdventureState,
  type PageBlock,
  type Resolution,
} from "@/lib/engine/bookAdventure";
import type { InteractionStyle } from "@/lib/client-store/types";
import { useDetour } from "@/lib/reader/useDetour";
import type { AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import type { Character } from "@/lib/schemas/content";
import { ChoicePrompt } from "./ChoicePrompt";
import { DetourPassage } from "./DetourPassage";
import { Passage } from "./Passage";
import { StyleSelector } from "./StyleSelector";

export interface AdventureActions {
  choose: (cp: ChoicePoint, option: AdventureOption) => void;
  keepOriginal: (cpId: string) => void;
  setStyle: (style: InteractionStyle, characterId?: string) => void;
  setDetourText: (cpId: string, segments: string[]) => void;
  undo: () => void;
}

export function AdventureBlocks({
  blocks,
  state,
  cast,
  bookId,
  sessionId,
  actions,
}: {
  blocks: PageBlock[];
  state: AdventureState;
  cast: Character[];
  bookId: string;
  sessionId: string;
  actions: AdventureActions;
}) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "canon") return <Passage key={i} paragraphs={b.paragraphs} />;
        if (b.type === "choice") {
          return (
            <ChoiceBlock key={b.cp.id} cp={b.cp} state={state} cast={cast} actions={actions} />
          );
        }
        return (
          <DetourBlock
            key={`${b.cp.id}-${b.resolution.optionId}`}
            resolution={b.resolution}
            bookId={bookId}
            sessionId={sessionId}
            actions={actions}
          />
        );
      })}
    </>
  );
}

function ChoiceBlock({
  cp,
  state,
  cast,
  actions,
}: {
  cp: ChoicePoint;
  state: AdventureState;
  cast: Character[];
  actions: AdventureActions;
}) {
  const introduced = castAvailableAt(cast, cp.chapter);
  const wrapper =
    "not-prose my-8 rounded-2xl bg-[var(--reader-accent)]/[0.06] p-5 font-sans text-base ring-1 ring-[var(--reader-accent)]/30 sm:p-6";

  // The first choice (or the first after switching into adventure mode) introduces the style.
  if (!state.style) {
    return (
      <div className={wrapper}>
        <StyleSelector characters={introduced} onDone={actions.setStyle} />
      </div>
    );
  }
  const name = cast.find((c) => c.id === state.characterId)?.name;
  const view = choiceView(cp, state.style, state.characterId, name);
  return (
    <div className={wrapper}>
      <ChoicePrompt
        cp={cp}
        view={view}
        onChoose={(o) => actions.choose(cp, o)}
        onKeepOriginal={() => actions.keepOriginal(cp.id)}
      />
    </div>
  );
}

function DetourBlock({
  resolution,
  bookId,
  sessionId,
  actions,
}: {
  resolution: Extract<Resolution, { kind: "detour" }>;
  bookId: string;
  sessionId: string;
  actions: AdventureActions;
}) {
  const needsText = resolution.segments.length === 0;
  const { status, retry } = useDetour(
    needsText
      ? {
          bookId,
          cpId: resolution.cpId,
          optionId: resolution.optionId,
          perspective: resolution.perspective,
          sessionId,
        }
      : null,
  );

  const { setDetourText } = actions;
  useEffect(() => {
    if (status.state === "ready") setDetourText(resolution.cpId, status.segments);
  }, [status, resolution.cpId, setDetourText]);

  return (
    <DetourPassage
      choiceLabel={resolution.optionLabel}
      status={status}
      segments={resolution.segments}
      note={resolution.narratorFallbackNote}
      onRetry={retry}
      onReturnToOriginal={() => actions.keepOriginal(resolution.cpId)}
      onUndo={actions.undo}
    />
  );
}
