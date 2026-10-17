"use client";

import { useSyncExternalStore } from "react";
import type { ProgressStore } from "./ProgressStore";
import { createMemoryStorage, LocalStorageProgressStore } from "./localStorageStore";

let store: ProgressStore | undefined;

/** The app-wide client store. Falls back to memory when localStorage is unavailable. */
export function getStore(): ProgressStore {
  if (!store) {
    let storage;
    try {
      storage = window.localStorage;
      storage.getItem("probe");
    } catch {
      storage = createMemoryStorage();
    }
    store = new LocalStorageProgressStore(storage);
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
 */
export function useStoreVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );
}

export type { ProgressStore } from "./ProgressStore";
export * from "./types";
