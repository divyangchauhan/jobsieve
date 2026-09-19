import { z } from 'zod';
import {
  DEFAULT_EXCLUDES,
  DEFAULT_STACK,
  ROLE_FAMILIES,
  SENIORITIES,
  LOCATION_TYPES,
  REGION_ELIGIBILITY,
} from '../scoring/taxonomy';
const terms = z.array(z.string().trim().min(1).max(100)).max(50);
const choices = (allowed: readonly string[]) =>
  terms.refine(
    (items) => items.every((item) => allowed.includes(item)),
    'Unknown profile option',
  );
export const profileSchema = z.object({
  roleFamilies: choices(Object.keys(ROLE_FAMILIES)),
  seniorities: choices(Object.keys(SENIORITIES)),
  stack: terms,
  locationTypes: choices(LOCATION_TYPES),
  regionEligibility: choices(REGION_ELIGIBILITY),
  excludeTerms: terms,
  freshnessDays: z.number().int().min(1).max(365).nullable(),
  minFitScore: z.number().int().min(0).max(100).nullable(),
  companies: terms.default([]),
  companyKeywords: terms.default([]),
  jobKeywords: terms.default([]),
});
export type Profile = z.infer<typeof profileSchema>;
export function defaultProfile(): Profile {
  return {
    roleFamilies: ['Backend', 'DevOps/SRE/Platform'],
    seniorities: ['Senior', 'Staff', 'Lead'],
    stack: [...DEFAULT_STACK],
    locationTypes: ['remote'],
    regionEligibility: ['global', 'india-eligible'],
    excludeTerms: [...DEFAULT_EXCLUDES],
    freshnessDays: null,
    minFitScore: null,
    companies: [],
    companyKeywords: [],
    jobKeywords: [],
  };
}
