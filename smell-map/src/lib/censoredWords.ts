/**
 * List of slurs and offensive terms that users cannot enter in descriptions.
 * Matching is case-insensitive and whole-word.
 */
export const CENSORED_WORDS: string[] = [
  // Hate speech / slurs (lowercase; add or remove per your moderation policy)
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "retarded",
  "tranny",
  "chink",
  "spic",
  "kike",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns true if text contains any blocked term (case-insensitive, whole-word).
 */
export function containsOffensiveTerms(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  for (const word of CENSORED_WORDS) {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
    if (re.test(text)) return true;
  }
  return false;
}
