/*
 * Sample web3.career API payload:
 * GET https://web3.career/api/v1?token=TOKEN
 * [
 *   {
 *     "id": "12345",
 *     "title": "Senior Solidity Developer",
 *     "company": "DeFi Protocol",
 *     "date": "2024-01-15",
 *     "url": "https://web3.career/senior-solidity-developer-defi-protocol+12345",
 *     "tags": ["solidity", "ethereum", "defi"],
 *     "location": "Remote",
 *     "salary": "$100,000 - $150,000"
 *   }
 * ]
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';

const TIMEOUT_MS = 10_000;
const API_BASE = 'https://web3.career/api/v1';

interface Web3CareerEntry {
  readonly id?: string | number;
  readonly title?: string;
  readonly company?: string;
  readonly date?: string;
  readonly url?: string;
  readonly tags?: readonly string[];
  readonly location?: string;
  readonly salary?: string;
}

@Injectable()
export class Web3CareerAdapter implements SourceAdapter {
  readonly name = 'web3career';
  private readonly logger = new Logger(Web3CareerAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async fetchJobs(): Promise<NormalizedJob[]> {
    const token = this.config.get<string>('WEB3CAREER_TOKEN');
    if (!token) {
      this.logger.warn('WEB3CAREER_TOKEN not set — skipping web3career adapter');
      return [];
    }

    try {
      const { data } = await axios.get<Web3CareerEntry[]>(API_BASE, {
        timeout: TIMEOUT_MS,
        params: { token },
        headers: { 'User-Agent': 'jobsieve/1.0' },
      });
      return data.flatMap((entry) => {
        const job = this.normalize(entry);
        return job !== null ? [job] : [];
      });
    } catch (err) {
      this.logger.error(`web3career fetch failed: ${String(err)}`);
      return [];
    }
  }

  normalize(entry: Web3CareerEntry): NormalizedJob | null {
    if (!entry.title || !entry.company || !entry.url) return null;

    const location = (entry.location ?? '').toLowerCase();
    const remote = location === '' || location.includes('remote') || location.includes('worldwide');
    const sourceJobId = entry.id != null ? String(entry.id) : undefined;

    return {
      source: this.name,
      ...(sourceJobId !== undefined ? { sourceJobId } : {}),
      title: entry.title,
      company: entry.company,
      url: entry.url,
      ...(entry.date !== undefined ? { postedAt: new Date(entry.date) } : {}),
      tags: entry.tags ? [...entry.tags] : [],
      remote,
      ...(entry.salary !== undefined ? { salary: entry.salary } : {}),
    };
  }
}
