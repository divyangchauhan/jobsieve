import {
  DEFAULT_EXCLUDES,
  DEFAULT_STACK,
} from '../scoring/taxonomy.js';
import { PROFILE_ID, Profile } from './profile.entity.js';

// Seed profile matching the current target so the app ranks sensibly out of the box.
export function buildDefaultProfile(): Profile {
  const profile = new Profile();
  profile.id = PROFILE_ID;
  profile.roleFamilies = ['Backend', 'DevOps/SRE/Platform'];
  profile.seniorities = ['Senior', 'Staff', 'Lead'];
  profile.stack = [...DEFAULT_STACK];
  profile.locationTypes = ['remote'];
  profile.regionEligibility = ['global', 'india-eligible'];
  profile.excludeTerms = [...DEFAULT_EXCLUDES];
  profile.freshnessDays = null;
  profile.minFitScore = null;
  return profile;
}
