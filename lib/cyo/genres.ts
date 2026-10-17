import settings from "@/content/surprise-settings.json";

export const GENRES = [
  {
    id: "fantasy",
    label: "Fantasy",
    blurb: "Magic, dragons and enchanted places",
    color: "#6B4C9A",
  },
  { id: "sci-fi", label: "Sci-Fi", blurb: "Space, robots and the future", color: "#1B7F7F" },
  { id: "mystery", label: "Mystery", blurb: "Clues, secrets and puzzles", color: "#1F2A44" },
  { id: "adventure", label: "Adventure", blurb: "Journeys, treasure and danger", color: "#C2412D" },
  { id: "spooky", label: "Spooky", blurb: "Ghosts and shivers (kid-friendly!)", color: "#4A3A6B" },
  {
    id: "realistic",
    label: "Realistic",
    blurb: "Everyday life, friends and family",
    color: "#2F6B3F",
  },
  { id: "humor", label: "Humor", blurb: "Silly, funny and ridiculous", color: "#B7791F" },
  {
    id: "quest",
    label: "Quest party",
    blurb: "A D&D-style quest with a band of heroes",
    color: "#7A4F2A",
  },
] as const;

export type GenreId = (typeof GENRES)[number]["id"];

export function isGenre(id: string): id is GenreId {
  return GENRES.some((g) => g.id === id);
}

export function genreLabel(id: string): string {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}

const SETTINGS = settings as Record<GenreId, string[]>;

/** Free "Surprise Me": a random hand-written setting for the genre, avoiding recent picks. */
export function surpriseSetting(
  genre: GenreId,
  avoid: string[] = [],
  random = Math.random,
): string {
  const pool = SETTINGS[genre].filter((s) => !avoid.includes(s));
  const list = pool.length ? pool : SETTINGS[genre];
  return list[Math.floor(random() * list.length)];
}

/** A few settings to suggest when a kid's idea gets redirected. */
export function suggestions(genre: GenreId, n = 3): string[] {
  const out: string[] = [];
  while (out.length < n) out.push(surpriseSetting(genre, out));
  return out;
}

export const SETTING_MAX = 120;
export const DETAILS_MAX = 280;
