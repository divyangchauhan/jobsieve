/*
 * Remotive API — no auth required.
 * GET https://remotive.com/api/remote-jobs?category=software-dev&limit=100
 * Response: { jobs: [{ id, url, title, company_name, tags, job_type,
 *                      publication_date, candidate_required_location, salary, description }] }
 * All jobs are remote by nature of the platform.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { passesTitleFilter } from './title-filter.js';

const TIMEOUT_MS = 10_000;
const API_URL = 'https://remotive.com/api/remote-jobs';

interface RemotiveJob {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly company_name: string;
  readonly tags: readonly string[];
  readonly job_type?: string;
  readonly publication_date?: string;
  readonly candidate_required_location?: string;
  readonly salary?: string;
  readonly description?: string;
}

interface RemotiveResponse {
  readonly jobs: RemotiveJob[];
}

@Injectable()
export class RemotiveAdapter implements SourceAdapter {
  readonly name = 'remotive';
  private readonly logger = new Logger(RemotiveAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    try {
      const { data } = await axios.get<RemotiveResponse>(API_URL, {
        timeout: TIMEOUT_MS,
        params: { category: 'software-dev', limit: 100 },
        headers: { 'User-Agent': 'jobsieve/1.0' },
      });
      return data.jobs.flatMap((job) => {
        const normalized = this.normalize(job);
        return normalized !== null ? [normalized] : [];
      });
    } catch (err) {
      this.logger.error(`remotive fetch failed: ${String(err)}`);
      return [];
    }
  }

  normalize(job: RemotiveJob): NormalizedJob | null {
    if (!job.title || !job.company_name || !job.url) return null;
    if (!passesTitleFilter(job.title)) return null;

    const salary = job.salary && job.salary.length > 0 ? job.salary : undefined;
    const tags: string[] = [...job.tags];
    if (job.job_type) tags.push(job.job_type);

    return {
      source: this.name,
      sourceJobId: String(job.id),
      title: job.title,
      company: job.company_name,
      url: job.url,
      ...(job.publication_date !== undefined
        ? { postedAt: new Date(job.publication_date) }
        : {}),
      tags,
      remote: true,
      ...(salary !== undefined ? { salary } : {}),
      ...(job.description !== undefined ? { description: job.description } : {}),
    };
  }
}
