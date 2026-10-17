"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FontSize, ReaderPrefs, ReaderTheme } from "@/lib/client-store/types";

const SIZES: { value: FontSize; label: string; sample: string }[] = [
  { value: "s", label: "Small text", sample: "text-base" },
  { value: "m", label: "Medium text", sample: "text-xl" },
  { value: "l", label: "Large text", sample: "text-2xl" },
];

const THEMES: { value: ReaderTheme; label: string; swatch: string }[] = [
  { value: "light", label: "Light", swatch: "bg-[#fffdf8] text-[#1f2a44]" },
  { value: "sepia", label: "Sepia", swatch: "bg-[#f1e4cc] text-[#3e2f22]" },
  { value: "dark", label: "Dark", swatch: "bg-[#16181d] text-[#e6e1d6]" },
];

/** "Aa" button opening a small panel with font size and theme. */
export function ReaderControls({
  prefs,
  onChange,
}: {
  prefs: ReaderPrefs;
  onChange: (p: Partial<ReaderPrefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="min-h-11 min-w-11 rounded-full px-3 font-reading text-lg font-semibold hover:bg-[var(--reader-line)]"
      >
        <span aria-hidden="true">Aa</span>
        <span className="sr-only">Text settings</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Text settings"
          className="absolute right-0 z-30 mt-2 w-72 rounded-2xl bg-[var(--reader-page)] p-4 shadow-xl ring-1 ring-[var(--reader-line)]"
        >
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-[var(--reader-muted)]">
              Text size
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={prefs.fontSize === s.value}
                  aria-label={s.label}
                  onClick={() => onChange({ fontSize: s.value })}
                  className={`min-h-12 rounded-xl font-reading ring-2 ${s.sample} ${
                    prefs.fontSize === s.value
                      ? "ring-[var(--reader-accent)]"
                      : "ring-[var(--reader-line)]"
                  }`}
                >
                  A
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-[var(--reader-muted)]">
              Page color
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={prefs.theme === t.value}
                  onClick={() => onChange({ theme: t.value })}
                  className={`min-h-12 rounded-xl text-sm font-semibold ring-2 ${t.swatch} ${
                    prefs.theme === t.value
                      ? "ring-[var(--reader-accent)]"
                      : "ring-[var(--reader-line)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
