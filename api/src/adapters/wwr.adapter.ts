/*
 * We Work Remotely RSS feeds — no auth required.
 * Feed item fields: title (format: "Company: Job Title"), link (canonical URL),
 *   guid (same as link), pubDate, region, description (HTML).
 * All jobs are remote. Two feed URLs: back-end + devops/sysadmin.
 */
import { Injectable, Logger } from '@nestjs/common';

import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { fetchRssFeed, type RssItem } from './rss-helper.js';

const FEEDS = [
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
] as const;

function parseWwrTitle(raw: string): { company: string; title: string } {
  const colonIdx = raw.indexOf(': ');
  if (colonIdx !== -1) {
    return {
      company: raw.slice(0, colonIdx).trim(),
      title: raw.slice(colonIdx + 2).trim(),
    };
  }
  return { company: '', title: raw.trim() };
}

@Injectable()
export class WwrAdapter implements SourceAdapter {
  readonly name = 'weworkremotely';
  private readonly logger = new Logger(WwrAdapter.name);

  async fetchJobs(): Promise<NormalizedJob[]> {
    const results = await Promise.all(
      FEEDS.map(async (feedUrl) => {
        try {
          const items = await fetchRssFeed(feedUrl);
          return items.flatMap((item) => {
            const job = this.normalize(item);
            return job !== null ? [job] : [];
          });
        } catch (err) {
          this.logger.error(`weworkremotely feed ${feedUrl} failed: ${String(err)}`);
          return [];
        }
      }),
    );
    return results.flat();
  }

  normalize(item: RssItem): NormalizedJob | null {
    const rawTitle = item.title ?? '';
    const url = item.link ?? item.guid ?? '';
    if (!rawTitle || !url) return null;

    const { company, title } = parseWwrTitle(rawTitle);
    if (!title) return null;

    // guid is the canonical URL — use it as a dedup key
    const sourceJobId = item.guid ?? url;

    return {
      source: this.name,
      sourceJobId,
      title,
      company,
      url,
      ...(item.pubDate !== undefined ? { postedAt: new Date(item.pubDate) } : {}),
      tags: [],
      remote: true,
      ...(item.content !== undefined ? { description: item.content } : {}),
    };
  }
}
