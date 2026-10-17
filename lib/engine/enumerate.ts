import type { AdventureMap, AdventureOption, ChoicePoint } from "@/lib/schemas/adventure";
import { choiceView } from "./bookAdventure";

export interface DetourCombo {
  cp: ChoicePoint;
  option: AdventureOption;
  /** "narrator" or a character id. */
  perspective: string;
}

/**
 * Every detour a reader can reach in a book, using the same rules as the reader UI (choiceView):
 * - "direct the story":  plot options, narrator
 * - "be a character":    each present character's own options, their perspective
 * - "both":              the character's options + the first plot option, their perspective
 * Duplicates (same option + perspective) are listed once.
 */
export function enumerateDetours(map: AdventureMap): DetourCombo[] {
  const out: DetourCombo[] = [];
  const seen = new Set<string>();
  const add = (cp: ChoicePoint, options: AdventureOption[], perspective: string) => {
    for (const option of options) {
      const key = `${cp.id}:${option.id}:${perspective}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cp, option, perspective });
    }
  };
  for (const cp of map.choicePoints) {
    const direct = choiceView(cp, "direct", undefined);
    add(cp, direct.options, direct.perspective);
    for (const charId of cp.availableCharacters) {
      for (const style of ["character", "both"] as const) {
        const v = choiceView(cp, style, charId);
        add(cp, v.options, v.perspective);
      }
    }
  }
  return out;
}
