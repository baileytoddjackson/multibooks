import type { Character } from "@/lib/schemas/content";

/**
 * Perspective instructions for Adventure Mode. "narrator" keeps the book's own narrative voice;
 * a character id tells the story from that character's point of view.
 *
 * Only the book's own first-person narrator (Ishmael) is written in first person. Everyone else is
 * close third person, so kids never read "I, Captain Ahab..." in a voice the author never used.
 */
export function perspectiveInstructions(character: Character | undefined): string {
  if (!character) {
    return `Perspective: the book's own narrator, in the same person as the original (past tense).`;
  }
  const names = [character.name, ...character.alsoKnownAs].join(" / ");
  const person =
    character.pov === "first"
      ? `Write in FIRST person as ${character.name}, exactly as the book's narrator.`
      : `Write in close THIRD person, following ${character.name}: what they see, think and feel. Past tense.`;
  return `Perspective: ${names}.
${person}
Who they are: ${character.profile}
How they sound: ${character.voiceNotes}
Stay true to this character as the author wrote them; don't give them knowledge or powers they don't have.`;
}
