/*
 * Sample RemoteOK API payload (element 0 is metadata — always dropped):
 * [
 *   { "last_updated": 1780635992, "legal": "API Terms of Service: ..." },
 *   {
 *     "slug": "remote-ts-engineer-acme-1132845",
 *     "id": "1132845",
 *     "epoch": "1780554702",
 *     "date": "2026-06-04T06:31:42+00:00",
 *     "company": "Acme Corp",
 *     "position": "Senior TypeScript Engineer",
 *     "tags": ["typescript", "nodejs", "remote"],
 *     "description": "<p>We are looking for...</p>",
 *     "location": "Worldwide",
 *     "salary_min": "100000",
 *     "salary_max": "150000",
 *     "apply_url": "https://remoteOK.com/remote-jobs/...",
 *     "url": "https://remoteOK.com/remote-jobs/remote-ts-engineer-acme-1132845"
 *   }
 * ]
 * Notes: salary_min/salary_max are strings; "0" means not provided.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';

const TIMEOUT_MS = 10_000;
const API_URL = 'https://remoteok.com/api';
const REMOTE_LOCATIONS = ['', 'remote', 'worldwide', 'anywhere'] as const;

export interface RemoteOkEntry {
  readonly id?: string;
  readonly position?: string;
  readonly company?: string;
  readonly url?: string;
  readonly tags?: readonly string[];
  readonly date?: string;
  readonly description?: string;
  readonly salary_min?: string;
  readonly salary_max?: string;
  readonly location?: string;
}

function buildSalary(minStr?: string, maxStr?: string): string | undefined {
  const min = Number(minStr ?? '0');
  const max = Number(maxStr ?? '0');
  if (min > 0 && max > 0) return `$${min.toLocaleString()}–$${max.toLocaleString()}`;
  if (min > 0) return `$${min.toLocaleString()}+`;
  return undefined;
}

@Injectable()
export class RemoteOKAdapter implements SourceAdapter {
  readonly name = 'remoteok';
  private readonly logger = new Logger(RemoteOKAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    try {
      const { data } = await axios.get<RemoteOkEntry[]>(API_URL, {
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': 'jobsieve/1.0' },
      });
      const [, ...entries] = data;
      return entries.flatMap((entry) => {
        const job = this.normalize(entry);
        return job !== null ? [job] : [];
      });
    } catch (err) {
      this.logger.error(`remoteok fetch failed: ${String(err)}`);
      return [];
    }
  }

  normalize(entry: RemoteOkEntry): NormalizedJob | null {
    if (!entry.position || !entry.company || !entry.url) return null;

    const location = (entry.location ?? '').toLowerCase().trim();
    const remote = REMOTE_LOCATIONS.some((loc) => location === loc || location.includes('remote'));
    const salary = buildSalary(entry.salary_min, entry.salary_max);

    return {
      source: this.name,
      ...(entry.id !== undefined ? { sourceJobId: entry.id } : {}),
      title: entry.position,
      company: entry.company,
      url: entry.url,
      ...(entry.date !== undefined ? { postedAt: new Date(entry.date) } : {}),
      tags: entry.tags ? [...entry.tags] : [],
      remote,
      ...(salary !== undefined ? { salary } : {}),
      ...(entry.description !== undefined ? { description: entry.description } : {}),
    };
  }
}
