/*
 * Ashby public posting API — no auth required.
 * GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 * Response: { jobs: [{ id, title, location, isRemote, jobUrl, publishedAt,
 *                      employmentType, descriptionPlain, compensation }] }
 * compensation.scrapeableCompensationSalarySummary may be a human-readable string when set.
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
const API_BASE = 'https://api.ashbyhq.com/posting-api/job-board';

interface AshbyCompensation {
  readonly scrapeableCompensationSalarySummary?: string | null;
}

interface AshbyJob {
  readonly id: string;
  readonly title: string;
  readonly location?: string;
  readonly isRemote?: boolean;
  readonly jobUrl?: string;
  readonly publishedAt?: string;
  readonly employmentType?: string;
  readonly department?: string;
  readonly team?: string;
  readonly descriptionPlain?: string;
  readonly compensation?: AshbyCompensation;
}

interface AshbyResponse {
  readonly jobs: AshbyJob[];
}

@Injectable()
export class AshbyAdapter implements SourceAdapter {
  readonly name = 'ashby';
  private readonly logger = new Logger(AshbyAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    const companies = COMPANIES.filter((c) => c.ats === 'ashby');
    const tasks = companies.map((company) => async (): Promise<NormalizedJob[]> => {
      try {
        const { data } = await withRetry(() =>
          axios.get<AshbyResponse>(
            `${API_BASE}/${company.slug}`,
            {
              timeout: TIMEOUT_MS,
              params: { includeCompensation: true },
              headers: { 'User-Agent': 'jobsieve/1.0' },
            },
          ),
        );
        return (data.jobs ?? []).flatMap((job) => {
          const normalized = this.normalize(job, company.slug, company.name);
          return normalized !== null ? [normalized] : [];
        });
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          this.logger.debug(`ashby/${company.slug} not found — slug may have changed`);
        } else {
          this.logger.warn(`ashby/${company.slug} fetch failed: ${String(err)}`);
        }
        return [];
      }
    });

    const nested = await runBatched(tasks, CONCURRENCY);
    return nested.flat();
  }

  normalize(
    job: AshbyJob,
    companySlug: string,
    companyName: string,
  ): NormalizedJob | null {
    if (!job.title || !job.jobUrl) return null;
    if (!passesTitleFilter(job.title)) return null;

    const location = job.location ?? '';
    const remote = job.isRemote === true || /remote/i.test(location);

    const tags: string[] = [];
    if (job.department) tags.push(job.department);
    if (job.team) tags.push(job.team);
    if (job.employmentType) tags.push(job.employmentType);
    if (location) tags.push(location);

    const salary = job.compensation?.scrapeableCompensationSalarySummary ?? undefined;

    return {
      source: this.name,
      sourceJobId: `${companySlug}:${job.id}`,
      title: job.title,
      company: companyName,
      url: job.jobUrl,
      ...(job.publishedAt !== undefined ? { postedAt: new Date(job.publishedAt) } : {}),
      tags,
      remote,
      ...(salary != null && salary.length > 0 ? { salary } : {}),
      ...(job.descriptionPlain !== undefined ? { description: job.descriptionPlain } : {}),
    };
  }
}
