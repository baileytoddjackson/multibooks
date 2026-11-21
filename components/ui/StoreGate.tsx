"use client";

import type { ReactNode } from "react";
import { getStore, useStoreStatus } from "@/lib/client-store";

/**
 * Renders `children` once the reader's saved data has loaded, so components inside can read the
 * store synchronously (e.g. to open a book on the page they left off).
 */
export function StoreGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const status = useStoreStatus();
  if (status === "ready") return children;
  if (status === "loading") return fallback;
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
      <p className="font-display text-2xl font-semibold">We couldn&apos;t load your library.</p>
      <p className="mt-2 text-ink-soft">Check your connection, then try again.</p>
      <button
        type="button"
        onClick={() => void getStore().retry()}
        className="mt-5 inline-flex min-h-12 items-center rounded-full bg-teal px-6 font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
