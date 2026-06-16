import { createHash } from 'crypto';

// Words stripped when normalizing a company name.
export const COMPANY_STOPWORDS: ReadonlySet<string> = new Set([
  // English articles / prepositions
  'the', 'of', 'and', 'for', 'in', 'on', 'at', 'by', 'to', 'or', 'a', 'an',
  // Legal suffixes
  'inc', 'corp', 'llc', 'ltd', 'co',
  // Org-type suffixes
  'labs', 'lab', 'foundation', 'protocol', 'network', 'networks',
  'finance', 'trading', 'digital', 'group', 'capital',
  'technologies', 'technology', 'tech', 'solutions', 'internet', 'financial',
  'software',
  // Role/industry generic — too common as standalone tokens
  'security', 'services', 'management', 'systems', 'data',
  // Industry noise
  'web3', 'blockchain', 'crypto', 'defi', 'dao',
  // Financial sector generics
  'bank', 'exchange', 'wallet',
  // "prime" matches unrelated company names when used as standalone token
  'prime',
]);

// Location/modality noise stripped from job titles.
// Does NOT include tech qualifiers — "rust", "go", "solidity" must survive.
const TITLE_NOISE: ReadonlySet<string> = new Set([
  'remote', 'hybrid', 'onsite', 'contract',
  'fulltime', 'parttime', 'permanent', 'temporary',
  // German gender-suffix markers (normalised form after hyphen removal)
  'mfd', 'wmd', 'fmx', 'hf',
]);

// Tokenize one part of a company name into distinctive words.
export function normalizePart(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/\.io|\.fi|\.xyz|\.co|\.dev|\.ai/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !COMPANY_STOPWORDS.has(w));
}

// Returns distinct core tokens for a company name, including compacted forms
// (e.g. "MakerDAO" → {"maker", "dao", "makerdao"}).  Used for fuzzy matching.
export function coreTokens(name: string): Set<string> {
  const tokens = new Set<string>();
  for (const part of name.split(/\s*\/\s*/)) {
    const words = normalizePart(part);
    for (const w of words) tokens.add(w);
    if (words.length > 1) tokens.add(words.join(''));
  }
  return tokens;
}

// Tokenize a DB company/title field into words for whole-word matching.
export function tokenizeField(field: string): Set<string> {
  const words = normalizePart(field);
  const result = new Set<string>(words);
  if (words.length > 1) result.add(words.join(''));
  return result;
}

// True if any target core token appears as a whole word in the field tokens.
export function matchesField(
  targetTokens: ReadonlySet<string>,
  fieldTokens: ReadonlySet<string>,
): boolean {
  for (const t of targetTokens) {
    if (fieldTokens.has(t)) return true;
  }
  return false;
}

// Stable string for company fingerprinting: tokens joined in order, no compacted forms.
export function normalizeCompany(name: string): string {
  const tokens: string[] = [];
  for (const part of name.split(/\s*\/\s*/)) {
    tokens.push(...normalizePart(part));
  }
  return tokens.join(' ');
}

// Stable string for title fingerprinting.
// Drops location/modality noise; preserves tech qualifiers like "rust" or "go".
// Tokens are kept in order — "Engineer Manager" ≠ "Manager Engineer".
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // Collapse hyphenated noise compounds before stripping punctuation
    .replace(/\bon-site\b/g, 'onsite')
    .replace(/\bfull-time\b/g, 'fulltime')
    .replace(/\bpart-time\b/g, 'parttime')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !TITLE_NOISE.has(w))
    .join(' ');
}

// SHA-1 of normCompany + '|' + normTitle.
export function contentKey(company: string, title: string): string {
  const norm = normalizeCompany(company) + '|' + normalizeTitle(title);
  return createHash('sha1').update(norm).digest('hex');
}
