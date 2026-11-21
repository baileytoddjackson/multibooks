import type { ReactNode } from "react";
import { Suspense } from "react";
import { LogoMark } from "@/components/ui/Logo";

/** Centered card layout shared by the sign-in and sign-up pages. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[var(--radius-card)] bg-card p-6 shadow-[var(--shadow-page)] ring-1 ring-line sm:p-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="h-12 w-12" />
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
            Multi<span className="text-coral-strong">Books</span>
          </p>
          <h1 className="mt-6 font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-ink-soft">{intro}</p>
        </div>
        <Suspense fallback={<div className="h-72" aria-busy="true" />}>{children}</Suspense>
      </div>
    </main>
  );
}
