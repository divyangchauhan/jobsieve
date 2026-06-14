/*
 * web3.career API response structure:
 * GET https://web3.career/api/v1?token=TOKEN&limit=100[&tag=TAG]
 * [
 *   "Web3 Jobs API https://web3.career",   ← element 0: info string
 *   "\nURL params:\n...",                   ← element 1: docs string
 *   [                                        ← element 2: jobs array
 *     {
 *       "id": 149981,
 *       "date": "Thu, 4 Jun 2026 05:01:24 +0100",
 *       "date_epoch": 1780545684,
 *       "is_remote": true,
 *       "title": "AI Operations Specialist",
 *       "company": "Coin Market Cap Ltd",
 *       "apply_url": "https://web3.career/r/xgTO5QTM__XRGdrs",
 *       "tags": ["ai", "operations", "crypto", "remote"],
 *       "salary_min_value": null, "salary_max_value": null, "salary_currency": null
 *     }
 *   ]
 * ]
 *
 * Pagination: the API has no page/offset param. Instead, each tag=<name> query returns
 * the 100 most-recent jobs for that tag — with ~90% unique IDs across tags. We fetch
 * one unfiltered call + one call per FETCH_TAGS entry and dedup by id before returning.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';

const TIMEOUT_MS = 10_000;
const POLITENESS_MS = 500;
const API_BASE = 'https://web3.career/api/v1';

// Each tag returns the most-recent 100 jobs matching that tag. Overlap with the
// base (unfiltered) call is ~10%, so each tag adds ~90 unique jobs.
const FETCH_TAGS = [
  'typescript',
  'solidity',
  'rust',
  'golang',
  'python',
  'backend',
  'node',
  'ethereum',
  'defi',
  'smart-contract',
  'remote',
] as const;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    const seen = new Map<number, NormalizedJob>();

    const fetchTag = async (tag: string | null): Promise<void> => {
      const params: Record<string, string> = { token, limit: '100' };
      if (tag !== null) params['tag'] = tag;
      try {
        const { data } = await axios.get<Web3CareerResponse>(API_BASE, {
          timeout: TIMEOUT_MS,
          params,
          headers: { 'User-Agent': 'jobsieve/1.0' },
        });
        const jobs = data[2];
        if (!Array.isArray(jobs)) return;
        for (const entry of jobs) {
          if (seen.has(entry.id)) continue;
          const job = this.normalize(entry);
          if (job !== null) seen.set(entry.id, job);
        }
      } catch (err) {
        this.logger.warn(`web3career fetch failed (tag=${tag ?? 'none'}): ${String(err)}`);
      }
    };

    // Base call (no tag filter), then one per tag with politeness delay
    await fetchTag(null);
    for (const tag of FETCH_TAGS) {
      await delay(POLITENESS_MS);
      await fetchTag(tag);
    }

    this.logger.log(`web3career fetched ${seen.size} unique jobs across ${FETCH_TAGS.length + 1} queries`);
    return [...seen.values()];
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
