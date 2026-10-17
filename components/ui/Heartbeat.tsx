"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";

const INTERVAL_MS = 30_000;

function section(path: string) {
  if (path === "/") return "dashboard" as const;
  if (path.startsWith("/book/")) return "book" as const;
  if (path.startsWith("/read/")) return "read" as const;
  if (path.startsWith("/create")) return "create" as const;
  if (path.startsWith("/story/")) return "story" as const;
  return "other" as const;
}

/**
 * Sends a heartbeat every 30s while the page is visible. Active session time is estimated as
 * heartbeats × 30s, which ignores tabs left open in the background. Skipped on admin pages.
 *
 * Reads window.location when it fires rather than using a routing hook, so it can live in the
 * root layout without forcing every page to render dynamically.
 */
export function Heartbeat() {
  useEffect(() => {
    const id = setInterval(() => {
      const path = window.location.pathname;
      if (document.visibilityState !== "visible" || path.startsWith("/admin")) return;
      track("session_heartbeat", { path: section(path) });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}
