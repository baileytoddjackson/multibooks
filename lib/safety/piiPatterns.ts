/**
 * Personal-information patterns for the stepper's free-text fields. The app never needs real
 * names, contact details or locations, so anything that looks like one is gently redirected.
 * Made-up character names ("a girl named Zara") are fine; self-identifying phrases are not.
 */
const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/i },
  { kind: "url", re: /\b(?:https?:\/\/|www\.)\S+/i },
  { kind: "phone", re: /(?:\+?\d[\s().-]*){7,}/ },
  {
    kind: "address",
    re: /\b\d{1,5}\s+(?:[a-z]+\s){0,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|way|place|pl)\b/i,
  },
  { kind: "self_name", re: /\b(?:my name is|my name's|i am called|call me)\s+[a-z]+/i },
  { kind: "self_location", re: /\bi\s+(?:live|go to school)\s+(?:at|in|on|near)\b/i },
  {
    kind: "school",
    re: /\b[a-z]+(?:\s[a-z]+)?\s(?:elementary|middle|high|primary|junior high)\s+school\b/i,
  },
  { kind: "handle", re: /(?:^|\s)@[a-z0-9_]{3,}/i },
];

export function findPii(text: string): string | undefined {
  return PATTERNS.find((p) => p.re.test(text))?.kind;
}
