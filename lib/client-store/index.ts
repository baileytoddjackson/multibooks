"use client";

import { useEffect, useSyncExternalStore } from "react";
import { httpRemote } from "./remote";
import { createMemoryStorage, SyncedProgressStore, type StoreStatus } from "./syncedStore";

let store: SyncedProgressStore | undefined;

function signInAgain() {
  const here = window.location.pathname + window.location.search;
  // A full load on purpose: the in-memory store must not outlive the session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
}

/**
 * The app-wide client store: account data from the server, device data in localStorage (or
 * memory when localStorage is unavailable).
 */
export function getStore(): SyncedProgressStore {
  if (!store) {
    let storage;
    try {
      storage = window.localStorage;
      storage.getItem("probe");
    } catch {
      storage = createMemoryStorage();
    }
    store = new SyncedProgressStore(storage, httpRemote, {
      onChange: notifyStoreChanged,
      onSignedOut: signInAgain,
    });
    const s = store;
    // Send queued writes before the page goes away.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void s.flush();
    });
    window.addEventListener("pagehide", () => void s.flush());
  }
  return store;
}

/* A tiny change-notification channel so components re-read after writes. */
const listeners = new Set<() => void>();
let version = 0;

export function notifyStoreChanged() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Device settings (group code, preferences) changed in another tab.
  const onStorage = () => notifyStoreChanged();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Returns a monotonically increasing version that bumps whenever the store changes.
 * Returns -1 during SSR/hydration so callers can render a neutral placeholder.
 * Device data (session, prefs) is readable as soon as this is >= 0; account data needs
 * `useStoreStatus() === "ready"`.
 */
export function useStoreVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
}

/** Starts loading the account's saved data and reports when it's ready. */
export function useStoreStatus(): StoreStatus {
  useEffect(() => {
    void getStore().load();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => getStore().status(),
    () => "loading",
  );
}

/** Saves anything pending, ends the session and goes to the sign-in page. */
export async function signOut(): Promise<void> {
  const store = getStore();
  await store.flush().catch(() => undefined);
  // Shared classroom devices: nothing of this account's is left behind on the device.
  store.clearOutbox();
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  // A full load on purpose: drops this account's data from memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

export type { ProgressStore } from "./ProgressStore";
export type { StoreStatus } from "./syncedStore";
export * from "./types";
