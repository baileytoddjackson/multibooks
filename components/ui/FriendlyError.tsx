import type { ReactNode } from "react";

/** In-theme error/empty state. Never shows raw error text to readers. */
export function FriendlyError({
  title = "Oops, a page got stuck.",
  message = "Something went wrong on our side. Let's try that again.",
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="mx-auto my-10 flex max-w-md flex-col items-center gap-4 rounded-[var(--radius-card)] bg-card p-8 text-center ring-1 ring-line"
    >
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
        <path d="M10 14h20c3 0 2 4 2 4v34s-1-4-4-4H10z" fill="var(--color-marigold)" />
        <path d="M54 14H34c-3 0-2 4-2 4v34s1-4 4-4h18z" fill="var(--color-teal)" opacity="0.85" />
        <path d="M32 18v34" stroke="var(--color-ink)" strokeWidth="2" />
      </svg>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="text-ink-soft">{message}</p>
      {action}
    </div>
  );
}
