import {
  DEFAULT_EXCLUDES,
  DEFAULT_STACK,
  LOCATION_TYPES,
  REGION_ELIGIBILITY,
  ROLE_FAMILIES,
  SENIORITIES,
} from '../scoring/taxonomy.js';

// Taxonomy surfaced to the settings UI so option lists never drift from the
// scorer's config. Adding a family in taxonomy.ts shows up here automatically.
export interface ProfileOptions {
  readonly roleFamilies: readonly string[];
  readonly seniorities: readonly string[];
  readonly stack: readonly string[];
  readonly locationTypes: readonly string[];
  readonly regionEligibility: readonly string[];
  readonly defaultExcludes: readonly string[];
}

export function buildProfileOptions(): ProfileOptions {
  return {
    roleFamilies: Object.keys(ROLE_FAMILIES),
    seniorities: Object.keys(SENIORITIES),
    stack: DEFAULT_STACK,
    locationTypes: LOCATION_TYPES,
    regionEligibility: REGION_ELIGIBILITY,
    defaultExcludes: DEFAULT_EXCLUDES,
  };
}
