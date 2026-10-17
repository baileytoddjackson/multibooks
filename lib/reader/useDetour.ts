"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DetourStatus =
  | { state: "idle" }
  | { state: "loading"; text: string; waitingForOthers: boolean; note?: string }
  | { state: "ready"; segments: string[]; cached: boolean }
  | { state: "resting" }
  | { state: "error" };

export interface DetourTarget {
  bookId: string;
  cpId: string;
  optionId: string;
  perspective: string;
  sessionId: string;
}

const POLL_MS = 1500;
/** Friendly wait when the per-minute limit is hit (at most this many times per request). */
const MAX_RATE_LIMIT_WAITS = 2;
export const SLOW_DOWN_NOTE = "Lots of readers are adventuring right now. Your page is next…";
const MAX_WAIT_MS = 45_000;

type ServerEvent =
  | { type: "delta"; text: string }
  | { type: "ready"; segments: string[]; cached: boolean }
  | { type: "pending" }
  | { type: "denied"; reason: string; retryAfterSec?: number }
  | { type: "error"; code: string };

/** Reads the server-sent events from POST /api/detour. */
async function requestOnce(
  target: DetourTarget,
  signal: AbortSignal,
  onDelta: (t: string) => void,
): Promise<ServerEvent> {
  const res = await fetch("/api/detour", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
    signal,
  });
  if (!res.ok || !res.body) return { type: "error", code: `http_${res.status}` };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let last: ServerEvent = { type: "error", code: "no_result" };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).replace(/^data: /, "");
      buf = buf.slice(i + 2);
      if (!line) continue;
      const ev = JSON.parse(line) as ServerEvent;
      if (ev.type === "delta") onDelta(ev.text);
      else last = ev;
    }
  }
  return last;
}

/**
 * Fetches a detour for `target` (null = nothing to fetch). Streams text while it's being written,
 * waits politely if another reader is generating the same detour, and exposes a retry.
 */
export function useDetour(target: DetourTarget | null) {
  const [status, setStatus] = useState<DetourStatus>({ state: "idle" });
  const [attempt, setAttempt] = useState(0);
  const key = target
    ? `${target.bookId}:${target.cpId}:${target.optionId}:${target.perspective}`
    : "";
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const t = targetRef.current;
    if (!t) {
      setStatus({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const started = Date.now();
    let text = "";
    let rateLimitWaits = 0;
    setStatus({ state: "loading", text: "", waitingForOthers: false });

    (async () => {
      try {
        for (;;) {
          const ev = await requestOnce(t, ctrl.signal, (d) => {
            text += d;
            setStatus({ state: "loading", text, waitingForOthers: false });
          });
          if (ev.type === "ready") {
            setStatus({ state: "ready", segments: ev.segments, cached: ev.cached });
            return;
          }
          if (ev.type === "pending" && Date.now() - started < MAX_WAIT_MS) {
            setStatus({ state: "loading", text: "", waitingForOthers: true });
            await new Promise((r) => setTimeout(r, POLL_MS));
            if (ctrl.signal.aborted) return;
            continue;
          }
          if (
            ev.type === "denied" &&
            ev.reason === "rate_limited" &&
            rateLimitWaits < MAX_RATE_LIMIT_WAITS
          ) {
            rateLimitWaits++;
            setStatus({
              state: "loading",
              text: "",
              waitingForOthers: false,
              note: SLOW_DOWN_NOTE,
            });
            await new Promise((r) => setTimeout(r, Math.min(ev.retryAfterSec ?? 10, 30) * 1000));
            if (ctrl.signal.aborted) return;
            continue;
          }
          setStatus(ev.type === "denied" ? { state: "resting" } : { state: "error" });
          return;
        }
      } catch {
        if (!ctrl.signal.aborted) setStatus({ state: "error" });
      }
    })();
    return () => ctrl.abort();
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { status, retry };
}
