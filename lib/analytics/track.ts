"use client";

import { getStore } from "@/lib/client-store";
import type { EventProps, EventType } from "./events";

/**
 * Client-side event queue. Events are batched and sent every few seconds, and flushed with
 * sendBeacon when the page is hidden, so tracking never slows reading down. Failures are silent:
 * analytics must never break the app.
 */
const FLUSH_MS = 5000;
const MAX_BATCH = 25;

const queue: { type: EventType; props: unknown; ts: number }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

function payload(events: typeof queue) {
  const session = getStore().getSession();
  return JSON.stringify({ sessionId: session.anonId, sessionCode: session.sessionCode, events });
}

function flush(useBeacon = false) {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    const body = payload(batch);
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // ignore
  }
  if (queue.length) flush(useBeacon);
}

export function track<T extends EventType>(type: T, props: EventProps<T>): void {
  if (typeof window === "undefined") return;
  if (!listening) {
    listening = true;
    document.addEventListener(
      "visibilitychange",
      () => document.visibilityState === "hidden" && flush(true),
    );
    window.addEventListener("pagehide", () => flush(true));
  }
  queue.push({ type, props, ts: Date.now() });
  if (queue.length >= MAX_BATCH) flush();
  else timer ??= setTimeout(() => flush(), FLUSH_MS);
}

/** Word count for words_read events (matches the server's definition closely enough). */
export function wordsIn(...texts: string[]): number {
  return texts.reduce((n, t) => n + (t.match(/[\p{L}\p{N}’']+/gu)?.length ?? 0), 0);
}
