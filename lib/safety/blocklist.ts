/**
 * Cheap first-pass filter for kid-entered text and generated Create Your Own text.
 *
 * Words are matched as whole tokens after normalising common tricks (leetspeak, repeated
 * letters, separators), so "class" never trips on "ass" but "s3xxx" still does. Slurs are
 * deliberately not listed here: the model moderation check handles hate speech far better
 * than any list, and keeping them out of the codebase is kinder to whoever reads it.
 * Words like "murder" are left to the model check too: "a murder mystery on a train" is a fine
 * idea for this age group, and a hard block would only frustrate kids who picked Mystery.
 */

type Category = "sexual" | "profanity" | "self_harm" | "drugs" | "graphic_violence";

const TERMS: Record<Category, string[]> = {
  sexual: [
    "sex",
    "sexy",
    "porn",
    "porno",
    "nude",
    "nudes",
    "naked",
    "boobs",
    "boob",
    "penis",
    "vagina",
    "horny",
    "hentai",
    "xxx",
    "strip club",
    "stripper",
    "make out",
    "making out",
    "orgy",
    "fetish",
  ],
  profanity: [
    "fuck",
    "fucking",
    "fucker",
    "shit",
    "shitty",
    "bitch",
    "bastard",
    "asshole",
    "ass",
    "dick",
    "cock",
    "pussy",
    "cunt",
    "damn",
    "goddamn",
    "piss",
    "wtf",
    "stfu",
    "motherfucker",
    "bullshit",
  ],
  self_harm: [
    "suicide",
    "suicidal",
    "kill myself",
    "kill yourself",
    "kys",
    "self harm",
    "self-harm",
    "cut myself",
    "cutting myself",
    "want to die",
    "end my life",
    "hang myself",
  ],
  drugs: [
    "cocaine",
    "heroin",
    "meth",
    "weed",
    "marijuana",
    "crack",
    "lsd",
    "vape",
    "vaping",
    "drunk",
    "get high",
    "getting high",
    "beer",
    "vodka",
    "whiskey",
    "cigarette",
    "cigarettes",
  ],
  graphic_violence: [
    "gore",
    "gory",
    "decapitate",
    "decapitated",
    "behead",
    "torture",
    "tortured",
    "mutilate",
    "dismember",
    "disembowel",
    "bloodbath",
    "massacre",
    "shoot up",
    "school shooting",
    "slaughter",
    "rape",
  ],
};

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Lowercases, undoes leetspeak, collapses 3+ repeated letters, and keeps only letters/spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPILED = Object.entries(TERMS).map(([category, words]) => ({
  category: category as Category,
  re: new RegExp(`\\b(?:${words.map((w) => w.replace(/[-\s]/g, "\\s?")).join("|")})s?\\b`),
}));

/**
 * Words that are fine in kids' stories even though they appear above in other senses
 * (e.g. "crack" of thunder). Checked on the original text before blocking.
 */
const SAFE_PHRASES = /\b(?:crack(?:ed|ing)? (?:of|open|the|a)|cracks? in|root beer|ginger beer)\b/i;

export function findBlocked(text: string): Category | undefined {
  const n = normalize(text);
  // Also test with every repeated letter collapsed, so "fuuuck" matches while "kill" still can.
  const single = n.replace(/(.)\1+/g, "$1");
  for (const { category, re } of COMPILED) {
    if (re.test(n) || re.test(single)) {
      if (category === "drugs" && SAFE_PHRASES.test(text)) continue;
      return category;
    }
  }
  return undefined;
}

export type { Category as BlockCategory };
