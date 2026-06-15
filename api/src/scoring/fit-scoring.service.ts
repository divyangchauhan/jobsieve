import { Injectable } from '@nestjs/common';

import { matchesAny, matchesPhrase } from './phrase-match.js';
import {
  resolveRoleKeywords,
  resolveSeniorityKeywords,
} from './taxonomy.js';

// Title is the strongest signal, so title matches always outweigh description.
const ROLE_TITLE_SCORE = 5;
const ROLE_DESC_SCORE = 2;
const SENIORITY_TITLE_SCORE = 3;
const SENIORITY_DESC_SCORE = 1;
const STACK_TITLE_SCORE = 2;
const STACK_DESC_SCORE = 1;
const LOCATION_BOOST = 1;

// Minimal job shape the scorer reads — satisfied by both NormalizedJob (ingest)
// and the Job entity (read-time/rescore).
export interface ScorableJob {
  readonly title: string;
  readonly description?: string | null;
  readonly remote: boolean;
}

// Minimal profile shape the scorer reads — satisfied by the Profile entity.
export interface ScoringProfile {
  readonly roleFamilies: readonly string[];
  readonly seniorities: readonly string[];
  readonly stack: readonly string[];
  readonly locationTypes: readonly string[];
}

@Injectable()
export class FitScoringService {
  // Pure: same (job, profile) always yields the same score. No instance state.
  score(job: ScorableJob, profile: ScoringProfile): number {
    const title = job.title.toLowerCase();
    const description = (job.description ?? '').toLowerCase();

    const roleScore = this.scoreRoleFamily(title, description, profile);
    // Role family is the primary gate: no selected family matched → score ~0,
    // regardless of seniority/stack hits. This is what sinks non-target roles.
    if (roleScore === null) return 0;

    let total = roleScore;
    total += this.scoreSeniority(title, description, profile);
    total += this.scoreStack(title, description, profile);
    total += this.scoreLocation(job, profile);
    return total;
  }

  // Returns base role points, or null when a selected family exists but none
  // match (the hard "near-zero" signal). With no families selected, ranking
  // degrades gracefully: no gate, zero base points.
  private scoreRoleFamily(
    title: string,
    description: string,
    profile: ScoringProfile,
  ): number | null {
    if (profile.roleFamilies.length === 0) return 0;

    const keywords = resolveRoleKeywords(profile.roleFamilies);
    if (matchesAny(title, keywords)) return ROLE_TITLE_SCORE;
    if (matchesAny(description, keywords)) return ROLE_DESC_SCORE;
    return null;
  }

  // Seniority only modifies an already-relevant role; reached only after the
  // role gate passes, so a bare "Senior" in a non-matching title adds nothing.
  private scoreSeniority(
    title: string,
    description: string,
    profile: ScoringProfile,
  ): number {
    const keywords = resolveSeniorityKeywords(profile.seniorities);
    if (matchesAny(title, keywords)) return SENIORITY_TITLE_SCORE;
    if (matchesAny(description, keywords)) return SENIORITY_DESC_SCORE;
    return 0;
  }

  private scoreStack(
    title: string,
    description: string,
    profile: ScoringProfile,
  ): number {
    let total = 0;
    for (const term of profile.stack) {
      if (matchesPhrase(title, term)) total += STACK_TITLE_SCORE;
      else if (matchesPhrase(description, term)) total += STACK_DESC_SCORE;
    }
    return total;
  }

  private scoreLocation(job: ScorableJob, profile: ScoringProfile): number {
    if (job.remote && profile.locationTypes.includes('remote')) {
      return LOCATION_BOOST;
    }
    return 0;
  }
}
