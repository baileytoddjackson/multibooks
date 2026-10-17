"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FriendlyError } from "@/components/ui/FriendlyError";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex flex-1 items-center px-4">
      <FriendlyError
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => retry()}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Back to the library
            </ButtonLink>
          </div>
        }
      />
    </main>
  );
}
