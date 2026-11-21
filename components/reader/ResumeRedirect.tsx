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
    // Reading as written resumes where the reader left off; an adventure starts at the opening
    // (the reader corrects the chapter if the book's entry choice is later).
    const mode = params.get("mode") === "adventure" ? "adventure" : "canon";
    const saved = mode === "canon" ? getStore().getBookProgress(bookId) : undefined;
    const chapter = (saved && parseParagraphId(saved.position)?.chapter) || 1;
    router.replace(`/read/${bookId}/${chapter}?mode=${mode}`);
  }, [bookId, params, router, status]);

  return null;
}
