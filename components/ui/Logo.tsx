import Link from "next/link";

/** Three tilted book spines + Fraunces wordmark. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="6" y="9" width="8" height="25" rx="2" fill="var(--color-coral)" />
      <rect x="16" y="6" width="8" height="28" rx="2" fill="var(--color-teal)" />
      <rect
        x="26"
        y="9"
        width="8"
        height="25"
        rx="2"
        fill="var(--color-marigold)"
        transform="rotate(12 30 21)"
      />
      <rect x="4" y="34" width="32" height="2.5" rx="1.25" fill="var(--color-ink)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg"
      aria-label="MultiBooks home"
    >
      <LogoMark />
      <span className="font-display text-2xl font-semibold tracking-tight text-ink">
        Multi<span className="text-coral-strong">Books</span>
      </span>
    </Link>
  );
}
