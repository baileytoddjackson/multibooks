"use client";

import { useCallback } from "react";
import { getStore, notifyStoreChanged, useStoreVersion } from "@/lib/client-store";
import { DEFAULT_READER_PREFS } from "@/lib/client-store/ProgressStore";
import type { ReaderPrefs } from "@/lib/client-store/types";

export function useReaderPrefs(): [ReaderPrefs, (next: Partial<ReaderPrefs>) => void] {
  const version = useStoreVersion();
  const prefs = version >= 0 ? getStore().getReaderPrefs() : DEFAULT_READER_PREFS;
  const update = useCallback((next: Partial<ReaderPrefs>) => {
    const store = getStore();
    store.saveReaderPrefs({ ...store.getReaderPrefs(), ...next });
    notifyStoreChanged();
  }, []);
  return [prefs, update];
}
