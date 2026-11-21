import type { AdventureStory, InteractionStyle } from "@/lib/client-store/types";
import { castAvailableAt } from "@/lib/content/adventureMap";
import type { ChoiceView } from "@/lib/engine/bookAdventure";
import type { AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import type { BookMeta, Character } from "@/lib/schemas/content";

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The saved record for a new Adventure Mode story, made the moment the reader leaves the book at
 * its entry choice. It has no pages yet: the story page writes the first one.
 */
export function newAdventure(input: {
  book: Pick<BookMeta, "id" | "shortTitle">;
  entry: ChoicePoint;
  cast: Character[];
  option: AdventureOption;
  view: ChoiceView;
  style: InteractionStyle;
  characterId?: string;
  now?: number;
  id?: string;
}): AdventureStory {
  const now = input.now ?? Date.now();
  return {
    id: input.id ?? randomId(),
    kind: "adventure",
    bookId: input.book.id,
    title: `${input.book.shortTitle}: my adventure`,
    segments: [],
    cast: castAvailableAt(input.cast, input.entry.chapter).map((c) => ({
      id: c.id,
      name: c.name,
      oneLine: c.oneLine,
    })),
    style: input.style,
    characterId: input.style === "direct" ? undefined : input.characterId,
    branch: {
      chapter: input.entry.chapter,
      cpId: input.entry.id,
      optionId: input.option.id,
      choice: input.option.label,
      perspective: input.view.perspective,
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}
