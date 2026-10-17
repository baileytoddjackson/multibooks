"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { InteractionStyle } from "@/lib/client-store/types";
import type { Character } from "@/lib/schemas/content";
import { StyleSelector } from "./StyleSelector";

const STYLE_LABEL: Record<InteractionStyle, string> = {
  direct: "Directing the story",
  character: "Being a character",
  both: "Character + story",
};

/** Small adventure menu: change style/character, go back one choice, or switch to the original. */
export function AdventureSettings({
  style,
  characterId,
  characters,
  canUndo,
  onChangeStyle,
  onUndo,
  originalHref,
}: {
  style?: InteractionStyle;
  characterId?: string;
  characters: Character[];
  canUndo: boolean;
  onChangeStyle: (style: InteractionStyle, characterId?: string) => void;
  onUndo: () => void;
  originalHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const who = characters.find((c) => c.id === characterId)?.name;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          setEditing(false);
        }}
        className="min-h-11 min-w-11 rounded-full px-3 font-semibold text-[var(--reader-accent)] hover:bg-[var(--reader-line)]"
      >
        <span aria-hidden="true">✦</span>
        <span className="sr-only">Adventure settings</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Adventure settings"
          className="absolute right-0 z-30 mt-2 w-[min(92vw,26rem)] rounded-2xl bg-[var(--reader-page)] p-4 shadow-xl ring-1 ring-[var(--reader-line)]"
        >
          {editing ? (
            <StyleSelector
              heading="How do you want to play?"
              characters={characters}
              initialStyle={style}
              initialCharacterId={characterId}
              onDone={(s, c) => {
                onChangeStyle(s, c);
                setEditing(false);
                setOpen(false);
              }}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--reader-muted)]">
                {style
                  ? `${STYLE_LABEL[style]}${who ? ` as ${who}` : ""}`
                  : "Choose how to play at the next choice."}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-11 rounded-xl px-3 text-left font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)]"
              >
                Change how I play
              </button>
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  onUndo();
                  setOpen(false);
                }}
                className="min-h-11 rounded-xl px-3 text-left font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)] disabled:opacity-40"
              >
                ↺ Go back one choice
              </button>
              <Link
                href={originalHref}
                className="flex min-h-11 items-center rounded-xl px-3 font-semibold ring-2 ring-[var(--reader-line)] hover:bg-[var(--reader-line)]"
              >
                Read the original instead
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
