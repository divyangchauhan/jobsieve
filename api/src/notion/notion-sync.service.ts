import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Client } from '@notionhq/client';
import type { CreatePageParameters } from '@notionhq/client';
import { Repository } from 'typeorm';

import { Job } from '../jobs/job.entity.js';
import { DEFAULT_COLUMN_MAP, NotionColumnMap } from './notion-column-map.js';

type PageProperties = NonNullable<CreatePageParameters['properties']>;
type PageProperty = PageProperties[string];

const RATE_LIMIT_RPS = 3;

@Injectable()
export class NotionSyncService {
  private readonly logger = new Logger(NotionSyncService.name);
  private readonly client: Client | null = null;
  private readonly databaseId: string = '';
  private readonly columns: NotionColumnMap = DEFAULT_COLUMN_MAP;
  private tokenBucket = RATE_LIMIT_RPS;
  private lastRefill = Date.now();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
  ) {
    const token = this.config.get<string>('NOTION_TOKEN');
    const dbId = this.config.get<string>('NOTION_DATABASE_ID');

    if (!token || !dbId) return;

    this.client = new Client({
      auth: token,
      retry: { maxRetries: 5, initialRetryDelayMs: 1000 },
    });
    this.databaseId = dbId;
    this.columns = {
      title: this.config.get('NOTION_COL_TITLE', DEFAULT_COLUMN_MAP.title),
      company: this.config.get('NOTION_COL_COMPANY', DEFAULT_COLUMN_MAP.company),
      url: this.config.get('NOTION_COL_URL', DEFAULT_COLUMN_MAP.url),
      status: this.config.get('NOTION_COL_STATUS', DEFAULT_COLUMN_MAP.status),
      fitScore: this.config.get('NOTION_COL_FIT_SCORE', DEFAULT_COLUMN_MAP.fitScore),
      source: this.config.get('NOTION_COL_SOURCE', DEFAULT_COLUMN_MAP.source),
      postedAt: this.config.get('NOTION_COL_POSTED_AT', DEFAULT_COLUMN_MAP.postedAt),
      tags: this.config.get('NOTION_COL_TAGS', DEFAULT_COLUMN_MAP.tags),
    };
  }

  async pushJobs(jobs: Job[]): Promise<void> {
    if (!this.client) return;
    for (const job of jobs) {
      try {
        await this.syncJob(job);
      } catch (err) {
        this.logger.error(`Failed to sync job ${job.id} to Notion`, err);
      }
    }
  }

  private async syncJob(job: Job): Promise<void> {
    // client is checked by the caller (pushJobs)
    const client = this.client!;
    await this.acquireToken();
    const properties = this.buildProperties(job);

    if (job.notion_page_id) {
      await client.pages.update({ page_id: job.notion_page_id, properties });
      return;
    }

    const page = await client.pages.create({
      parent: { database_id: this.databaseId },
      properties,
    });
    await this.jobRepo.update(job.id, { notion_page_id: page.id });
  }

  private buildProperties(job: Job): Record<string, PageProperty> {
    const cols = this.columns;
    const props: Record<string, PageProperty> = {
      [cols.title]: { title: [{ text: { content: job.title } }] },
      [cols.company]: { rich_text: [{ text: { content: job.company } }] },
      [cols.url]: { url: job.url },
      [cols.status]: { select: { name: job.status } },
      [cols.fitScore]: { number: job.fit_score ?? 0 },
      [cols.source]: { select: { name: job.source } },
      [cols.tags]: { multi_select: job.tags.map((t) => ({ name: t })) },
    };

    if (job.posted_at) {
      props[cols.postedAt] = { date: { start: job.posted_at.toISOString() } };
    }

    return props;
  }

  private async acquireToken(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokenBucket = Math.min(
      RATE_LIMIT_RPS,
      this.tokenBucket + elapsed * RATE_LIMIT_RPS,
    );
    this.lastRefill = now;

    if (this.tokenBucket >= 1) {
      this.tokenBucket -= 1;
      return;
    }

    const waitMs = ((1 - this.tokenBucket) / RATE_LIMIT_RPS) * 1000;
    await sleep(waitMs);
    this.tokenBucket = 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
