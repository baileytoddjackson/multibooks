import { PROMPT_VERSION } from "@/lib/prompts/version";

/**
 * Shared detour cache key. Because book adventures have no free-text input, every detour is fully
 * determined by these parts, so one generation serves every reader who makes the same choice.
 * Bumping PROMPT_VERSION or the map version naturally retires old entries.
 */
export interface DetourKeyParts {
  bookId: string;
  mapVersion: number;
  cpId: string;
  optionId: string;
  /** "narrator" or a character id. */
  perspective: string;
}

const SAFE = /^[a-z0-9-]+$/;

export function detourCacheKey(p: DetourKeyParts, promptVersion = PROMPT_VERSION): string {
  for (const [k, v] of Object.entries({
    bookId: p.bookId,
    cpId: p.cpId,
    optionId: p.optionId,
    perspective: p.perspective,
  })) {
    if (!SAFE.test(v)) throw new Error(`Invalid ${k} for cache key: ${v}`);
  }
  return `detour:v${promptVersion}:${p.bookId}:m${p.mapVersion}:${p.cpId}:${p.optionId}:${p.perspective}`;
}

export function parseDetourCacheKey(
  key: string,
): (DetourKeyParts & { promptVersion: number }) | null {
  const m = /^detour:v(\d+):([a-z0-9-]+):m(\d+):([a-z0-9-]+):([a-z0-9-]+):([a-z0-9-]+)$/.exec(key);
  if (!m) return null;
  return {
    promptVersion: Number(m[1]),
    bookId: m[2],
    mapVersion: Number(m[3]),
    cpId: m[4],
    optionId: m[5],
    perspective: m[6],
  };
}
