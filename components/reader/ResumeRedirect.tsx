"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getStore, useStoreStatus } from "@/lib/client-store";
import { parseParagraphId } from "@/lib/content/chunk";
import type { BookId } from "@/lib/schemas/content";

export function ResumeRedirect({ bookId }: { bookId: BookId }) {
  const router = useRouter();
  const params = useSearchParams();
  const status = useStoreStatus();

  useEffect(() => {
    if (status !== "ready") return;
    const saved = getStore().getBookProgress(bookId);
    const mode = params.get("mode") ?? saved?.mode ?? "canon";
    const chapter = (saved && parseParagraphId(saved.position)?.chapter) || 1;
    router.replace(`/read/${bookId}/${chapter}?mode=${mode}`);
  }, [bookId, params, router, status]);

  return null;
}
