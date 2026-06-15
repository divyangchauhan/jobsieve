export interface Profile {
  roleFamilies: string[];
  seniorities: string[];
  stack: string[];
  locationTypes: string[];
  regionEligibility: string[];
  excludeTerms: string[];
  freshnessDays: number | null;
  minFitScore: number | null;
}

export interface ProfileOptions {
  roleFamilies: string[];
  seniorities: string[];
  stack: string[];
  locationTypes: string[];
  regionEligibility: string[];
  defaultExcludes: string[];
}
