/*
 * Sample HireWeb3 RSS item (parsed by rss-parser with custom fields):
 * {
 *   "title": "Office Manager",
 *   "link": "https://hireweb3.io/job/office-manager-circle/cll8hltxn0003xrgw5bbpbiok",
 *   "pubDate": "Sat, 12 Aug 2023 20:46:16 GMT",
 *   "companyName": "Circle",           ← hireweb3Jobs:companyName
 *   "locationType": "Remote",          ← hireweb3Jobs:locationType ("Remote" | "On-site" | ...)
 *   "jobLocation": "Singapore",        ← hireweb3Jobs:location
 *   "minSalary": "",                   ← hireweb3Jobs:minSalary (empty string = not provided)
 *   "maxSalary": "",                   ← hireweb3Jobs:maxSalary
 *   "content": "<div>...</div>",
 *   "contentSnippet": "plain text..."
 * }
 * Notes: title is the job position only (not "Title at Company").
 *        No categories/tags field exists in this feed.
 */
import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';

const TIMEOUT_MS = 10_000;
const RSS_URL = 'https://hireweb3.io/job/rss';

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  companyName?: string;
  locationType?: string;
  jobLocation?: string;
  minSalary?: string;
  maxSalary?: string;
};

function buildSalary(minStr?: string, maxStr?: string): string | undefined {
  const min = Number(minStr ?? '0');
  const max = Number(maxStr ?? '0');
  if (min > 0 && max > 0)
    return `$${min.toLocaleString()}–$${max.toLocaleString()}`;
  if (min > 0) return `$${min.toLocaleString()}+`;
  return undefined;
}

@Injectable()
export class HireWeb3Adapter implements SourceAdapter {
  readonly name = 'hireweb3';
  private readonly logger = new Logger(HireWeb3Adapter.name);
  private readonly parser = new Parser<Record<string, unknown>, RssItem>({
    timeout: TIMEOUT_MS,
    customFields: {
      item: [
        ['hireweb3Jobs:companyName', 'companyName'],
        ['hireweb3Jobs:locationType', 'locationType'],
        ['hireweb3Jobs:location', 'jobLocation'],
        ['hireweb3Jobs:minSalary', 'minSalary'],
        ['hireweb3Jobs:maxSalary', 'maxSalary'],
      ],
    },
  });

  async fetchJobs(): Promise<NormalizedJob[]> {
    try {
      const feed = await this.parser.parseURL(RSS_URL);
      return feed.items.flatMap((item) => {
        const job = this.normalize(item);
        return job !== null ? [job] : [];
      });
    } catch (err) {
      this.logger.error(`hireweb3 fetch failed: ${String(err)}`);
      return [];
    }
  }

  normalize(item: RssItem): NormalizedJob | null {
    if (!item.title || !item.link) return null;

    const company = item.companyName ?? 'Unknown';
    const remote = (item.locationType ?? '').toLowerCase() === 'remote';
    const dateStr = item.isoDate ?? item.pubDate;
    const description = item.contentSnippet ?? item.content;
    const salary = buildSalary(item.minSalary, item.maxSalary);

    return {
      source: this.name,
      title: item.title,
      company,
      url: item.link,
      ...(dateStr !== undefined ? { postedAt: new Date(dateStr) } : {}),
      tags: [],
      remote,
      ...(salary !== undefined ? { salary } : {}),
      ...(description !== undefined ? { description } : {}),
    };
  }
}
