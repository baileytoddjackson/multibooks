const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL;

/** Persistent, unobtrusive link to the pilot survey. Hidden when no survey URL is configured. */
export function FeedbackLink({ className = "" }: { className?: string }) {
  if (!FEEDBACK_URL) return null;
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-plum underline-offset-4 hover:underline ${className}`}
    >
      Give feedback
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
