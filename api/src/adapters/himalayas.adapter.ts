/*
 * Himalayas API — no auth required.
 * GET https://himalayas.app/jobs/api?skills=TypeScript,Python,Go&limit=100&offset=N
 * Response: { jobs: [...], totalCount: 96000+, offset: N, limit: N }
 *
 * Note: the server ignores the `limit` param and always returns 20 jobs per page.
 * Offset-based pagination works: offset=0, 20, 40, ... returns different batches.
 * We fetch up to MAX_PAGES pages and stop early if a page returns < PAGE_SIZE.
 *
 * Each job: { title, companyName, locationRestrictions, employmentType,
 *             minSalary, maxSalary, currency, categories, description,
 *             pubDate (unix seconds), applicationLink, guid }
 * guid is the canonical URL and serves as a stable dedup key.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { passesTitleFilter } from './title-filter.js';

const TIMEOUT_MS = 10_000;
const POLITENESS_MS = 500;
const API_URL = 'https://himalayas.app/jobs/api';
const SKILLS = 'TypeScript,Python,Go,NestJS,Node.js';
const PAGE_SIZE = 20; // server-enforced; limit param is ignored
const MAX_PAGES = 15; // safety cap: 15 × 20 = 300 jobs maximum

interface HimalayasJob {
  readonly title: string;
  readonly companyName: string;
  readonly locationRestrictions?: readonly string[];
  readonly employmentType?: string;
  readonly minSalary?: number;
  readonly maxSalary?: number;
  readonly currency?: string;
  readonly categories?: readonly string[];
  readonly description?: string;
  readonly pubDate?: number;
  readonly applicationLink?: string;
  readonly guid: string;
}

interface HimalayasResponse {
  readonly jobs: HimalayasJob[];
}

function buildSalary(
  min?: number,
  max?: number,
  currency?: string,
): string | undefined {
  if (!min && !max) return undefined;
  const sym = currency ?? 'USD';
  if (min && max) return `${sym} ${min.toLocaleString()}–${max.toLocaleString()}`;
  if (min) return `${sym} ${min.toLocaleString()}+`;
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class HimalayasAdapter implements SourceAdapter {
  readonly name = 'himalayas';
  private readonly logger = new Logger(HimalayasAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    const seen = new Map<string, NormalizedJob>();

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      if (page > 0) await delay(POLITENESS_MS);

      try {
        const { data } = await axios.get<HimalayasResponse>(API_URL, {
          timeout: TIMEOUT_MS,
          params: { skills: SKILLS, limit: PAGE_SIZE, offset },
          headers: { 'User-Agent': 'jobsieve/1.0' },
        });

        const jobs = data.jobs ?? [];
        for (const job of jobs) {
          if (seen.has(job.guid)) continue;
          const normalized = this.normalize(job);
          if (normalized !== null) seen.set(job.guid, normalized);
        }

        if (jobs.length < PAGE_SIZE) break; // last page
      } catch (err) {
        this.logger.error(`himalayas fetch failed at offset=${offset}: ${String(err)}`);
        break; // return what was collected so far
      }
    }

    this.logger.log(`himalayas fetched ${seen.size} unique jobs`);
    return [...seen.values()];
  }

  normalize(job: HimalayasJob): NormalizedJob | null {
    if (!job.title || !job.companyName) return null;
    const url = job.applicationLink ?? job.guid;
    if (!url) return null;
    if (!passesTitleFilter(job.title)) return null;

    const restrictions = job.locationRestrictions ?? [];
    const remote = restrictions.length === 0 || restrictions.some((r) => /remote/i.test(r));

    const tags: string[] = [...(job.categories ?? [])];
    if (job.employmentType) tags.push(job.employmentType);

    const salary = buildSalary(job.minSalary, job.maxSalary, job.currency);

    // guid is the canonical himalayas URL — extract slug for sourceJobId
    const slugMatch = /\/jobs\/([^/]+)$/.exec(job.guid);
    const sourceJobId = slugMatch?.[1] ?? job.guid;

    return {
      source: this.name,
      sourceJobId,
      title: job.title,
      company: job.companyName,
      url,
      ...(job.pubDate !== undefined ? { postedAt: new Date(job.pubDate * 1000) } : {}),
      tags,
      remote,
      ...(salary !== undefined ? { salary } : {}),
      ...(job.description !== undefined ? { description: job.description } : {}),
    };
  }
}
