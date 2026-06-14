/*
 * Lever public postings API v0 — no auth required.
 * GET https://api.lever.co/v0/postings/{slug}?mode=json
 * Response (active board with postings):
 *   [{ id, text (title), hostedUrl, applyUrl, createdAt (ms epoch),
 *      categories: { location, team, commitment },
 *      descriptionPlain, workplaceType }]
 * Returns [] when the board exists but has no active postings.
 * Returns { ok: false, error: "Document not found" } for unknown slugs.
 * 404 → board gone / slug changed (logged at debug).
 * 429 / 5xx → transient; retried with backoff (logged at warn after max retries).
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { COMPANIES } from '../registry/company-registry.js';
import { runBatched } from './concurrency.js';
import { withRetry } from './retry.js';
import { passesTitleFilter } from './title-filter.js';

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;
const API_BASE = 'https://api.lever.co/v0/postings';

interface LeverCategories {
  readonly location?: string;
  readonly team?: string;
  readonly commitment?: string;
}

interface LeverPosting {
  readonly id: string;
  readonly text: string;
  readonly hostedUrl: string;
  readonly createdAt: number;
  readonly categories?: LeverCategories;
  readonly descriptionPlain?: string;
  readonly workplaceType?: string;
}

type LeverResponse = LeverPosting[] | { readonly ok: false; readonly error: string };

@Injectable()
export class LeverAdapter implements SourceAdapter {
  readonly name = 'lever';
  private readonly logger = new Logger(LeverAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    const companies = COMPANIES.filter((c) => c.ats === 'lever');
    const tasks = companies.map((company) => async (): Promise<NormalizedJob[]> => {
      try {
        const { data } = await withRetry(() =>
          axios.get<LeverResponse>(
            `${API_BASE}/${company.slug}`,
            {
              timeout: TIMEOUT_MS,
              params: { mode: 'json' },
              headers: { 'User-Agent': 'jobsieve/1.0' },
            },
          ),
        );
        if (!Array.isArray(data)) {
          this.logger.debug(`lever/${company.slug} not found — slug may have changed`);
          return [];
        }
        return (data as LeverPosting[]).flatMap((posting) => {
          const job = this.normalize(posting, company.slug, company.name);
          return job !== null ? [job] : [];
        });
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          this.logger.debug(`lever/${company.slug} not found — slug may have changed`);
        } else {
          this.logger.warn(`lever/${company.slug} fetch failed: ${String(err)}`);
        }
        return [];
      }
    });

    const nested = await runBatched(tasks, CONCURRENCY);
    return nested.flat();
  }

  normalize(
    posting: LeverPosting,
    companySlug: string,
    companyName: string,
  ): NormalizedJob | null {
    if (!posting.text || !posting.hostedUrl) return null;
    if (!passesTitleFilter(posting.text)) return null;

    const location = posting.categories?.location ?? '';
    const workplaceType = posting.workplaceType ?? '';
    const remote =
      /remote/i.test(location) || /remote/i.test(workplaceType);

    const tags: string[] = [];
    if (posting.categories?.team) tags.push(posting.categories.team);
    if (posting.categories?.commitment) tags.push(posting.categories.commitment);
    if (location) tags.push(location);

    return {
      source: this.name,
      sourceJobId: `${companySlug}:${posting.id}`,
      title: posting.text,
      company: companyName,
      url: posting.hostedUrl,
      postedAt: new Date(posting.createdAt),
      tags,
      remote,
      ...(posting.descriptionPlain !== undefined
        ? { description: posting.descriptionPlain }
        : {}),
    };
  }
}
