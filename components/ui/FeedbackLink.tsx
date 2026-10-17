"use client";

import { track } from "@/lib/analytics/track";
import { getStore, useStoreVersion } from "@/lib/client-store";

const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL;

/**
 * Persistent, unobtrusive link to the pilot survey. Hidden when no survey URL is configured.
 * If the URL contains "{sessionCode}", it's replaced with the device's group code (e.g. a
 * pre-filled survey field), so responses can be grouped without collecting names.
 */
export function FeedbackLink({ className = "" }: { className?: string }) {
  const version = useStoreVersion();
  if (!FEEDBACK_URL) return null;
  const code = version >= 0 ? (getStore().getSession().sessionCode ?? "") : "";
  const href = FEEDBACK_URL.replace("{sessionCode}", encodeURIComponent(code));
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("feedback_clicked", {})}
      className={`inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-plum underline-offset-4 hover:underline ${className}`}
    >
      Give feedback
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
