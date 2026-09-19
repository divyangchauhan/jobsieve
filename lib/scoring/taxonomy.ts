// Relevance taxonomy — config, not code. Extending to non-engineering families
// (e.g. Sales) later is a single edit here, never a scorer rewrite.

// Role family → keyword phrases matched (word-boundary, case-insensitive) against
// job title and description. A family is the primary relevance gate in scoring.
export const ROLE_FAMILIES: Record<string, string[]> = {
  Backend: [
    'backend',
    'back-end',
    'back end',
    'backend engineer',
    'backend developer',
    'backend software engineer',
    'software engineer',
    'software developer',
    'server-side',
    'server side',
    'api engineer',
    'api developer',
    'distributed systems',
    'distributed systems engineer',
    'systems engineer',
    'core engineer',
    'core backend',
    'protocol engineer',
    'blockchain engineer',
    'smart contract engineer',
    'smart contract',
    'solidity',
    'evm',
    'web3 engineer',
    'consensus engineer',
    'crypto engineer',
    'defi engineer',
    'staff engineer',
    'principal engineer',
    'senior engineer',
    'lead engineer',
    'founding engineer',
    'distinguished engineer',
    'member of technical staff',
  ],
  'DevOps/SRE/Platform': [
    'devops',
    'dev ops',
    'devops engineer',
    'sre',
    'site reliability',
    'site reliability engineer',
    'platform engineer',
    'platform engineering',
    'infrastructure engineer',
    'cloud engineer',
    'cloud infrastructure',
    'production engineer',
    'reliability engineer',
    'kubernetes engineer',
  ],
  Security: [
    'security engineer',
    'application security',
    'appsec',
    'product security',
    'infrastructure security',
    'cloud security',
    'security researcher',
    'offensive security',
    'penetration tester',
    'pentest',
    'smart contract auditor',
    'smart contract security',
    'blockchain security',
    'security audit',
    'security architect',
  ],
  Fullstack: [
    'fullstack',
    'full-stack',
    'full stack',
    'fullstack engineer',
    'full stack engineer',
    'full stack developer',
  ],
  'Data Engineering': [
    'data engineer',
    'data engineering',
    'data platform',
    'data pipeline',
    'data infrastructure',
    'etl',
  ],
  'ML/AI': [
    'machine learning engineer',
    'ml engineer',
    'mlops',
    'ai engineer',
    'applied ai',
    'ml infrastructure',
    'ai infrastructure',
  ],
  Frontend: [
    'frontend',
    'front-end',
    'front end',
    'frontend engineer',
    'frontend developer',
    'ui engineer',
    'web engineer',
  ],
  Mobile: [
    'mobile engineer',
    'ios engineer',
    'android engineer',
    'ios developer',
    'android developer',
    'react native',
  ],
  QA: [
    'qa engineer',
    'quality assurance',
    'test engineer',
    'sdet',
    'automation engineer',
  ],
};

export type RoleFamily = keyof typeof ROLE_FAMILIES;

// Seniority → keyword phrases. Bare "lead" is deliberately excluded (too noisy);
// only qualified lead phrases count.
export const SENIORITIES = {
  Junior: ['junior', 'jr', 'jr.', 'entry level', 'entry-level', 'graduate'],
  Mid: ['mid', 'mid-level', 'intermediate'],
  Senior: ['senior', 'sr', 'sr.'],
  Staff: ['staff'],
  Principal: ['principal'],
  Lead: ['tech lead', 'team lead', 'engineering lead'],
} as const;

export type Seniority = keyof typeof SENIORITIES;

// Single-word/letter stack terms that also appear as common English words.
// For these, stack matching is restricted to title + tags only (skips description).
export const AMBIGUOUS_STACK_TERMS: ReadonlySet<string> = new Set([
  'go',
  'r',
  'c',
  'd',
]);

export const DEFAULT_STACK = [
  'TypeScript',
  'NestJS',
  'Node.js',
  'Python',
  'Django',
  'Go',
  'Rust',
  'PostgreSQL',
  'MongoDB',
  'AWS',
  'Terraform',
  'Kafka',
  'Solidity',
] as const;

export const DEFAULT_EXCLUDES = [
  'sales',
  'account executive',
  'business development',
  'marketing',
  'recruiter',
  'talent',
  'customer success',
  'people operations',
  'finance',
  'accounting',
  'legal',
  'counsel',
  'office manager',
  'human resources',
  'administrative',
  'intern',
] as const;

export const LOCATION_TYPES = ['remote', 'hybrid', 'onsite'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const REGION_ELIGIBILITY = [
  'global',
  'anywhere',
  'apac',
  'india-eligible',
  'us-only',
  'eu-eligible',
  'uk-eligible',
] as const;
export type RegionEligibility = (typeof REGION_ELIGIBILITY)[number];

// Regions that mean "no geo restriction". When the profile selects one of these,
// region eligibility filtering is a no-op.
export const UNRESTRICTED_REGIONS: ReadonlySet<string> = new Set([
  'global',
  'anywhere',
]);

// Phrases in a job's text that indicate it is hard-locked to a specific region.
// Used best-effort: a job is dropped only when it is locked to a region the
// profile is NOT eligible for. Ambiguous jobs are kept.
export const REGION_LOCK_TERMS: Readonly<Record<string, readonly string[]>> = {
  'us-only': [
    'us only',
    'u.s. only',
    'us-based only',
    'must be based in the us',
    'must reside in the united states',
    'authorized to work in the united states',
  ],
  'eu-eligible': ['eu only', 'eu-based only', 'must be based in the eu'],
  'uk-eligible': ['uk only', 'uk-based only', 'must be based in the uk'],
} as const;

// Resolve a list of selected role-family names to their combined keyword phrases.
export function resolveRoleKeywords(
  families: readonly string[],
): readonly string[] {
  const phrases: string[] = [];
  for (const family of families) {
    const keywords = ROLE_FAMILIES[family];
    if (keywords !== undefined) phrases.push(...keywords);
  }
  return phrases;
}

// Resolve a list of selected seniority names to their combined keyword phrases.
export function resolveSeniorityKeywords(
  seniorities: readonly string[],
): readonly string[] {
  const phrases: string[] = [];
  for (const name of seniorities) {
    const keywords = SENIORITIES[name as Seniority];
    if (keywords !== undefined) phrases.push(...keywords);
  }
  return phrases;
}
