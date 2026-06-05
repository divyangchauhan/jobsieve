/*
 * Sample HireWeb3 RSS item:
 * {
 *   "title": "Senior Solidity Developer at DeFi Protocol",
 *   "link": "https://hireweb3.io/job/senior-solidity-developer-defi-protocol",
 *   "pubDate": "Mon, 15 Jan 2024 00:00:00 +0000",
 *   "isoDate": "2024-01-15T00:00:00.000Z",
 *   "contentSnippet": "We are looking for an experienced Solidity developer...",
 *   "categories": ["solidity", "ethereum", "remote"]
 * }
 */
import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';

const TIMEOUT_MS = 10_000;
const RSS_URL = 'https://hireweb3.io/job/rss';
const AT_PATTERN = /^(.+?)\s+at\s+(.+)$/i;

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  categories?: string[];
};

function parseTitleAndCompany(raw: string): { title: string; company: string } {
  const match = AT_PATTERN.exec(raw);
  if (match !== null) {
    return { title: match[1]?.trim() ?? raw, company: match[2]?.trim() ?? 'Unknown' };
  }
  return { title: raw, company: 'Unknown' };
}

@Injectable()
export class HireWeb3Adapter implements SourceAdapter {
  readonly name = 'hireweb3';
  private readonly logger = new Logger(HireWeb3Adapter.name);
  private readonly parser = new Parser<Record<string, unknown>, RssItem>({
    timeout: TIMEOUT_MS,
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

    const { title, company } = parseTitleAndCompany(item.title);
    const categories = item.categories ?? [];
    const isRemote = categories.some((c) => c.toLowerCase() === 'remote');
    const dateStr = item.isoDate ?? item.pubDate;
    const description = item.contentSnippet ?? item.content;

    return {
      source: this.name,
      title,
      company,
      url: item.link,
      ...(dateStr !== undefined ? { postedAt: new Date(dateStr) } : {}),
      tags: categories,
      remote: isRemote,
      ...(description !== undefined ? { description } : {}),
    };
  }
}
