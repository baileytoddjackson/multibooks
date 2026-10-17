import type { Metadata } from "next";
import { Stepper } from "@/components/create/Stepper";
import { Logo } from "@/components/ui/Logo";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const metadata: Metadata = { title: "Create your own story" };

export default function CreatePage() {
  return (
    <>
      <header className="px-4 pt-6 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex-1 px-4 py-8 sm:px-8">
        <Stepper />
      </main>
      <SiteFooter />
    </>
  );
}
