/*
 * Greenhouse public boards API — no auth required.
 * GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 * Response: { jobs: [{ id, title, updated_at, absolute_url, location: { name }, content }] }
 * content is HTML stored as HTML entities (&lt;h2&gt; etc.); decoded before storage.
 * 404 → board gone / slug changed (logged at debug).
 * 429 / 5xx → transient; retried with backoff (logged at warn after max retries).
 */
import { Logger } from '../logger';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface';
import { SourceAdapter } from '../ingestion/source-adapter.interface';
import { COMPANIES } from '../registry/company-registry';
import { runBatched } from './concurrency';
import { withRetry } from './retry';
import { passesTitleFilter } from './title-filter';

const TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;
const API_BASE = 'https://boards-api.greenhouse.io/v1/boards';

interface GreenhouseLocation {
  readonly name: string;
}

interface GreenhouseJob {
  readonly id: number;
  readonly title: string;
  readonly updated_at?: string;
  readonly absolute_url: string;
  readonly location?: GreenhouseLocation;
  readonly content?: string;
  readonly departments?: ReadonlyArray<{ readonly name: string }>;
}

interface GreenhouseResponse {
  readonly jobs: GreenhouseJob[];
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export class GreenhouseAdapter implements SourceAdapter {
  readonly name = 'greenhouse';
  private readonly logger = new Logger(GreenhouseAdapter.name);
  get failures() {
    return this.logger.failures;
  }

  constructor(
    private readonly offset = 0,
    private readonly batchSize = 10,
  ) {}

  async fetchJobs(): Promise<NormalizedJob[]> {
    const companies = COMPANIES.filter((c) => c.ats === 'greenhouse').slice(
      this.offset,
      this.offset + this.batchSize,
    );
    const tasks = companies.map(
      (company) => async (): Promise<NormalizedJob[]> => {
        try {
          const { data } = await withRetry(() =>
            axios.get<GreenhouseResponse>(`${API_BASE}/${company.slug}/jobs`, {
              timeout: TIMEOUT_MS,
              params: { content: true },
              headers: { 'User-Agent': 'jobsieve/1.0' },
            }),
          );
          return data.jobs.flatMap((job) => {
            const normalized = this.normalize(job, company.slug, company.name);
            return normalized !== null ? [normalized] : [];
          });
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            this.logger.debug(
              `greenhouse/${company.slug} not found — slug may have changed`,
            );
          } else {
            this.logger.warn(
              `greenhouse/${company.slug} fetch failed: ${String(err)}`,
            );
          }
          return [];
        }
      },
    );

    const nested = await runBatched(tasks, CONCURRENCY);
    return nested.flat();
  }

  normalize(
    job: GreenhouseJob,
    companySlug: string,
    companyName: string,
  ): NormalizedJob | null {
    if (!job.title || !job.absolute_url) return null;
    if (!passesTitleFilter(job.title)) return null;

    const locationName = job.location?.name ?? '';
    const remote = /remote/i.test(locationName);
    const rawContent = job.content ?? '';
    const description =
      rawContent.length > 0 ? decodeHtmlEntities(rawContent) : undefined;
    const tags = job.departments?.map((d) => d.name) ?? [];

    return {
      source: this.name,
      sourceJobId: `${companySlug}:${String(job.id)}`,
      title: job.title,
      company: companyName,
      url: job.absolute_url,
      // updated_at is not a publication timestamp; retain unknown postedAt.
      tags,
      remote,
      ...(description !== undefined ? { description } : {}),
    };
  }
}
