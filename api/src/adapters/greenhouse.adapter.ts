/*
 * Greenhouse public boards API — no auth required.
 * GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 * Response: { jobs: [{ id, title, updated_at, absolute_url, location: { name }, content }] }
 * content is HTML stored as HTML entities (&lt;h2&gt; etc.); decoded before storage.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { COMPANIES } from '../registry/company-registry.js';
import { runBatched } from './concurrency.js';
import { passesTitleFilter } from './title-filter.js';

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

@Injectable()
export class GreenhouseAdapter implements SourceAdapter {
  readonly name = 'greenhouse';
  private readonly logger = new Logger(GreenhouseAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    const companies = COMPANIES.filter((c) => c.ats === 'greenhouse');
    const tasks = companies.map((company) => async (): Promise<NormalizedJob[]> => {
      try {
        const { data } = await axios.get<GreenhouseResponse>(
          `${API_BASE}/${company.slug}/jobs`,
          {
            timeout: TIMEOUT_MS,
            params: { content: true },
            headers: { 'User-Agent': 'jobsieve/1.0' },
          },
        );
        return data.jobs.flatMap((job) => {
          const normalized = this.normalize(job, company.slug, company.name);
          return normalized !== null ? [normalized] : [];
        });
      } catch (err) {
        this.logger.warn(`greenhouse/${company.slug} fetch failed: ${String(err)}`);
        return [];
      }
    });

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
    const description = rawContent.length > 0 ? decodeHtmlEntities(rawContent) : undefined;
    const tags = job.departments?.map((d) => d.name) ?? [];

    return {
      source: this.name,
      sourceJobId: `${companySlug}:${String(job.id)}`,
      title: job.title,
      company: companyName,
      url: job.absolute_url,
      ...(job.updated_at !== undefined ? { postedAt: new Date(job.updated_at) } : {}),
      tags,
      remote,
      ...(description !== undefined ? { description } : {}),
    };
  }
}
