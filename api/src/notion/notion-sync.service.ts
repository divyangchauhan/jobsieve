import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
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
      name: this.config.get('NOTION_COL_NAME', DEFAULT_COLUMN_MAP.name),
      position: this.config.get('NOTION_COL_POSITION', DEFAULT_COLUMN_MAP.position),
      link: this.config.get('NOTION_COL_LINK', DEFAULT_COLUMN_MAP.link),
      stage: this.config.get('NOTION_COL_STAGE', DEFAULT_COLUMN_MAP.stage),
    };
  }

  async pushJob(job: Job): Promise<void> {
    if (!this.client) {
      throw new BadGatewayException('Notion is not configured');
    }
    try {
      await this.syncJob(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Notion API error';
      throw new BadGatewayException(message);
    }
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

    if (job.notion_page_id) {
      await client.pages.update({
        page_id: job.notion_page_id,
        properties: this.buildCoreProperties(job),
      });
      return;
    }

    const page = await client.pages.create({
      parent: { database_id: this.databaseId },
      properties: {
        ...this.buildCoreProperties(job),
        [this.columns.stage]: { status: { name: 'To apply' } },
      },
    });
    await this.jobRepo.update(job.id, { notion_page_id: page.id });
  }

  private buildCoreProperties(job: Job): Record<string, PageProperty> {
    const cols = this.columns;
    return {
      [cols.name]: { title: [{ text: { content: job.company } }] },
      [cols.position]: { rich_text: [{ text: { content: job.title } }] },
      [cols.link]: { url: job.url },
    };
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
