// Word-boundary, case-insensitive phrase matching against already-lowercased text.
// Uses alphanumeric lookarounds (not \b) so phrases containing punctuation —
// "node.js", "sr.", "back-end" — match correctly at word edges.

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhraseRegex(phrase: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(phrase)}(?![a-z0-9])`);
}

// True if `phrase` appears as a whole token in `lowerText` (which must already
// be lowercased).
export function matchesPhrase(lowerText: string, phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return buildPhraseRegex(normalized).test(lowerText);
}

// True if any of `phrases` matches `lowerText`.
export function matchesAny(
  lowerText: string,
  phrases: readonly string[],
): boolean {
  return phrases.some((phrase) => matchesPhrase(lowerText, phrase));
}
