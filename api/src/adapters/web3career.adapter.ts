/*
 * web3.career API response structure:
 * GET https://web3.career/api/v1?token=TOKEN&limit=50
 * [
 *   "Web3 Jobs API https://web3.career",   ← element 0: info string
 *   "\nURL params:\nremote=true...",         ← element 1: docs string
 *   [                                        ← element 2: jobs array
 *     {
 *       "id": 149981,
 *       "date": "Thu, 4 Jun 2026 05:01:24 +0100",
 *       "date_epoch": 1780545684,
 *       "is_remote": true,
 *       "country": "united-arab-emirates",
 *       "city": "dubai",
 *       "title": "AI Operations Specialist",
 *       "company": "Coin Market Cap Ltd",
 *       "location": " Dubai",
 *       "apply_url": "https://web3.career/r/xgTO5QTM__XRGdrs",
 *       "tags": ["ai", "operations", "crypto", "remote"],
 *       "salary_min_value": null,
 *       "salary_max_value": null,
 *       "salary_currency": null,
 *       "salary_unit": null,
 *       "estimated_min_salary": 60000,
 *       "estimated_max_salary": 90000,
 *       "estimated_avg_salary": 75000,
 *       "description": "<div>...</div>"
 *     }
 *   ]
 * ]
 * Notes: apply_url is the only URL field (redirect link). is_remote is a boolean.
 *        salary_min/max_value are null when undisclosed.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';

const TIMEOUT_MS = 10_000;
const API_BASE = 'https://web3.career/api/v1';

interface Web3CareerEntry {
  readonly id: number;
  readonly date?: string;
  readonly is_remote: boolean;
  readonly title: string;
  readonly company: string;
  readonly apply_url: string;
  readonly tags?: readonly string[];
  readonly salary_min_value: number | null;
  readonly salary_max_value: number | null;
  readonly salary_currency: string | null;
  readonly description?: string;
}

type Web3CareerResponse = [string, string, Web3CareerEntry[]];

function buildSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | undefined {
  if (min === null && max === null) return undefined;
  const sym = currency ?? 'USD';
  if (min !== null && max !== null)
    return `${sym} ${min.toLocaleString()}–${max.toLocaleString()}`;
  if (min !== null) return `${sym} ${min.toLocaleString()}+`;
  return undefined;
}

@Injectable()
export class Web3CareerAdapter implements SourceAdapter {
  readonly name = 'web3career';
  private readonly logger = new Logger(Web3CareerAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchJobs(): Promise<NormalizedJob[]> {
    const token = this.config.get<string>('WEB3CAREER_TOKEN');
    if (!token) {
      this.logger.warn(
        'WEB3CAREER_TOKEN not set — skipping web3career adapter',
      );
      return [];
    }

    try {
      const { data } = await axios.get<Web3CareerResponse>(API_BASE, {
        timeout: TIMEOUT_MS,
        params: { token },
        headers: { 'User-Agent': 'jobsieve/1.0' },
      });
      const jobs = data[2];
      return jobs.flatMap((entry) => {
        const job = this.normalize(entry);
        return job !== null ? [job] : [];
      });
    } catch (err) {
      this.logger.error(`web3career fetch failed: ${String(err)}`);
      return [];
    }
  }

  normalize(entry: Web3CareerEntry): NormalizedJob | null {
    if (!entry.title || !entry.company || !entry.apply_url) return null;

    const salary = buildSalary(
      entry.salary_min_value,
      entry.salary_max_value,
      entry.salary_currency,
    );

    return {
      source: this.name,
      sourceJobId: String(entry.id),
      title: entry.title,
      company: entry.company,
      url: entry.apply_url,
      ...(entry.date !== undefined ? { postedAt: new Date(entry.date) } : {}),
      tags: entry.tags ? [...entry.tags] : [],
      remote: entry.is_remote,
      ...(salary !== undefined ? { salary } : {}),
      ...(entry.description !== undefined
        ? { description: entry.description }
        : {}),
    };
  }
}
