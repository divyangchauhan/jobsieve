/*
 * Himalayas API — no auth required.
 * GET https://himalayas.app/jobs/api?skills=TypeScript,Python,Go&limit=100
 * Response: { jobs: [{ title, companyName, locationRestrictions, employmentType,
 *                      minSalary, maxSalary, currency, categories, description,
 *                      pubDate (unix seconds), applicationLink, guid }] }
 * guid is the canonical URL and serves as a stable dedup key.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { passesTitleFilter } from './title-filter.js';

const TIMEOUT_MS = 10_000;
const API_URL = 'https://himalayas.app/jobs/api';
const SKILLS = 'TypeScript,Python,Go,NestJS,Node.js';
const LIMIT = 100;

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

@Injectable()
export class HimalayasAdapter implements SourceAdapter {
  readonly name = 'himalayas';
  private readonly logger = new Logger(HimalayasAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    try {
      const { data } = await axios.get<HimalayasResponse>(API_URL, {
        timeout: TIMEOUT_MS,
        params: { skills: SKILLS, limit: LIMIT },
        headers: { 'User-Agent': 'jobsieve/1.0' },
      });
      return (data.jobs ?? []).flatMap((job) => {
        const normalized = this.normalize(job);
        return normalized !== null ? [normalized] : [];
      });
    } catch (err) {
      this.logger.error(`himalayas fetch failed: ${String(err)}`);
      return [];
    }
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
