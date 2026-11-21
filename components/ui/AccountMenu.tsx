"use client";

import { useState } from "react";
import { getStore, signOut, useStoreStatus } from "@/lib/client-store";

/** Signed-in email and a sign-out button, for page headers. */
export function AccountMenu() {
  const status = useStoreStatus();
  const [busy, setBusy] = useState(false);
  const email = status === "ready" ? getStore().account()?.email : undefined;

  return (
    <div className="flex items-center gap-2 text-sm">
      {email && (
        <span className="hidden max-w-56 truncate text-ink-soft sm:inline" title={email}>
          {email}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut();
        }}
        className="min-h-11 rounded-full px-4 font-semibold ring-2 ring-line hover:bg-paper-deep disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
