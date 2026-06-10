import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { In, Repository } from 'typeorm';

import { ADAPTER_PROVIDERS } from '../adapters/adapters.module.js';
import { dedupKey } from '../ingestion/dedup-key.js';
import { IngestionService } from '../ingestion/ingestion.service.js';
import { NormalizedJob } from '../ingestion/normalized-job.interface.js';
import { SourceAdapter } from '../ingestion/source-adapter.interface.js';
import { Job } from '../jobs/job.entity.js';
import { NotionSyncService } from '../notion/notion-sync.service.js';
import { FitScoringService } from '../scoring/fit-scoring.service.js';

const DEFAULT_CRON = '0 */4 * * *';

@Injectable()
export class CronOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(CronOrchestratorService.name);

  constructor(
    @Inject(ADAPTER_PROVIDERS) private readonly adapters: SourceAdapter[],
    private readonly ingestion: IngestionService,
    private readonly scoring: FitScoringService,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly notionSync: NotionSyncService,
  ) {}

  onModuleInit(): void {
    const schedule = this.config.get<string>('CRON_SCHEDULE', DEFAULT_CRON);
    const job = new CronJob(schedule, () => {
      void this.runIngestion();
    });
    this.schedulerRegistry.addCronJob('ingestion', job);
    job.start();
    this.logger.log(`Ingestion cron scheduled: ${schedule}`);
  }

  async runIngestion(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        const jobs = await adapter.fetchJobs();
        const newJobs = await this.ingestion.upsert(jobs);

        const keyMap = new Map<string, NormalizedJob>(
          jobs.map((j) => [dedupKey(j), j]),
        );
        for (const newJob of newJobs) {
          const normalized = keyMap.get(newJob.dedup_key);
          if (normalized !== undefined) {
            await this.jobRepo.update(newJob.id, {
              fit_score: this.scoring.score(normalized),
            });
          }
        }

        if (newJobs.length > 0) {
          const scoredJobs = await this.jobRepo.findBy({
            id: In(newJobs.map((j) => j.id)),
          });
          await this.notionSync.pushJobs(scoredJobs);
        }

        this.logger.log(
          `${adapter.name}: ${jobs.length} fetched, ${newJobs.length} new`,
        );
      } catch (err) {
        this.logger.error(`${adapter.name} failed`, err);
      }
    }
  }
}
