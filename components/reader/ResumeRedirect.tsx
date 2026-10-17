"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getStore } from "@/lib/client-store";
import { parseParagraphId } from "@/lib/content/chunk";
import type { BookId } from "@/lib/schemas/content";

export function ResumeRedirect({ bookId }: { bookId: BookId }) {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const saved = getStore().getBookProgress(bookId);
    const mode = params.get("mode") ?? saved?.mode ?? "canon";
    const chapter = (saved && parseParagraphId(saved.position)?.chapter) || 1;
    router.replace(`/read/${bookId}/${chapter}?mode=${mode}`);
  }, [bookId, params, router]);

  return null;
}
