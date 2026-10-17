"use client";

import { useId, useState } from "react";
import { getStore, notifyStoreChanged, useStoreVersion } from "@/lib/client-store";

const CODE_PATTERN = /^[A-Za-z0-9-]{0,20}$/;

/**
 * Lets a facilitator tag this device with a group code (e.g. "LIB-OCT20") so pilot results can
 * be grouped without collecting names. Collapsed by default to stay out of kids' way.
 */
export function SessionCodeField() {
  const version = useStoreVersion();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const saved = version >= 0 ? getStore().getSession().sessionCode : undefined;
  const value = draft ?? saved ?? "";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg px-2 text-sm text-ink-soft underline-offset-4 hover:underline"
      >
        {saved ? `Group code: ${saved}` : "Have a group code?"}
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        getStore().setSessionCode(value.trim().toUpperCase() || undefined);
        notifyStoreChanged();
        setDraft(null);
        setOpen(false);
      }}
    >
      <label htmlFor={id} className="text-sm text-ink-soft">
        Group code
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => CODE_PATTERN.test(e.target.value) && setDraft(e.target.value)}
        placeholder="e.g. LIB-OCT20"
        autoComplete="off"
        maxLength={20}
        className="min-h-11 w-40 rounded-lg border-2 border-line bg-card px-3 uppercase"
      />
      <button type="submit" className="min-h-11 rounded-lg bg-ink px-4 font-semibold text-paper">
        Save
      </button>
    </form>
  );
}
