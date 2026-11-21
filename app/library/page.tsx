import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LibraryView } from "@/components/library/LibraryView";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const metadata: Metadata = { title: "My library" };

/** Everything the reader has saved. The list itself comes from the client store. */
export default function LibraryPage() {
  return (
    <>
      <header className="px-4 pt-6 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Logo />
          <AccountMenu />
        </div>
      </header>

      <main id="main" className="px-4 pt-8 pb-12 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold">
            ← Back to the books
          </Link>
          <h1 className="mt-2 mb-6 font-display text-4xl font-semibold">My library</h1>
          <Suspense fallback={<div className="h-96" aria-busy="true" />}>
            <LibraryView />
          </Suspense>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
