import type { Toc } from "@/lib/schemas/content";

type TocEntry = Toc["chapters"][number];

/** "Chapter 3", "Book IV", or "Epilogue". */
export function chapterLabel(entry: Pick<TocEntry, "index" | "title">): string {
  if (/^Book [IVXL]+$/.test(entry.title)) return entry.title;
  if (entry.title === "Epilogue") return "Epilogue";
  return `Chapter ${entry.index}`;
}

/** The descriptive name shown under the label (Odyssey uses its book summary line). */
export function chapterName(entry: Pick<TocEntry, "title" | "subtitle">): string | undefined {
  if (/^Book [IVXL]+$/.test(entry.title)) return entry.subtitle;
  if (entry.title === "Epilogue") return undefined;
  return entry.title;
}
