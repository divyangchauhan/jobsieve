import { Brackets, SelectQueryBuilder } from 'typeorm';

import { Profile } from '../profile/profile.entity.js';
import {
  REGION_LOCK_TERMS,
  UNRESTRICTED_REGIONS,
} from '../scoring/taxonomy.js';
import { Job } from './job.entity.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Title text padded with spaces so a `% term %` LIKE approximates word-boundary.
const PADDED_TITLE = "(' ' || lower(job.title) || ' ')";
const TITLE_AND_DESC = "lower(job.title || ' ' || coalesce(job.description, ''))";

type Qb = SelectQueryBuilder<Job>;

// Hard pre-filters applied in SQL before scoring, shrinking the candidate set.
// The fuzzy role/stack/seniority signal is never a hard gate — it only ranks.
export function applyProfileFilters(qb: Qb, profile: Profile): void {
  applyExcludeTerms(qb, profile.excludeTerms);
  applyLocationTypes(qb, profile.locationTypes);
  applyRegionEligibility(qb, profile.regionEligibility);
  applyFreshness(qb, profile.freshnessDays);
}

// Drop any job whose title contains an exclude term (word-boundary). The main
// noise killer — recruiting/sales/ops floods.
function applyExcludeTerms(qb: Qb, excludeTerms: readonly string[]): void {
  excludeTerms.forEach((term, i) => {
    const clean = term.trim().toLowerCase();
    if (clean.length === 0) return;
    qb.andWhere(`${PADDED_TITLE} NOT LIKE :ex${i}`, {
      [`ex${i}`]: `% ${clean} %`,
    });
  });
}

// Keep only jobs matching a selected location type. Remote uses the existing
// flag; hybrid/onsite are best-effort text matches.
function applyLocationTypes(qb: Qb, locationTypes: readonly string[]): void {
  if (locationTypes.length === 0) return;

  qb.andWhere(
    new Brackets((w) => {
      if (locationTypes.includes('remote')) {
        w.orWhere('job.remote = 1');
      }
      if (locationTypes.includes('hybrid')) {
        w.orWhere(`${TITLE_AND_DESC} LIKE '%hybrid%'`);
      }
      if (locationTypes.includes('onsite')) {
        w.orWhere(`${TITLE_AND_DESC} LIKE '%onsite%'`);
        w.orWhere(`${TITLE_AND_DESC} LIKE '%on-site%'`);
        w.orWhere(`${TITLE_AND_DESC} LIKE '%on site%'`);
      }
    }),
  );
}

// Best-effort: drop jobs hard-locked to a region the profile is NOT eligible
// for. No-op when an unrestricted region (global/anywhere) is selected.
// Ambiguous jobs are kept — never hide on uncertainty.
function applyRegionEligibility(
  qb: Qb,
  regionEligibility: readonly string[],
): void {
  if (regionEligibility.length === 0) return;
  if (regionEligibility.some((r) => UNRESTRICTED_REGIONS.has(r))) return;

  const eligible = new Set(regionEligibility);
  let paramIndex = 0;
  for (const [region, phrases] of Object.entries(REGION_LOCK_TERMS)) {
    if (eligible.has(region)) continue;
    for (const phrase of phrases) {
      qb.andWhere(`${TITLE_AND_DESC} NOT LIKE :rg${paramIndex}`, {
        [`rg${paramIndex}`]: `%${phrase.toLowerCase()}%`,
      });
      paramIndex += 1;
    }
  }
}

function applyFreshness(qb: Qb, freshnessDays: number | null): void {
  if (freshnessDays === null) return;
  const cutoff = new Date(Date.now() - freshnessDays * MS_PER_DAY);
  qb.andWhere('job.last_seen_at >= :freshnessCutoff', {
    freshnessCutoff: cutoff.toISOString(),
  });
}
