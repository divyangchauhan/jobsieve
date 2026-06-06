import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Job } from '../jobs/job.entity.js';
import { dedupKey } from './dedup-key.js';
import { NormalizedJob } from './normalized-job.interface.js';

@Injectable()
export class IngestionService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  async upsert(jobs: NormalizedJob[]): Promise<Job[]> {
    if (jobs.length === 0) return [];

    const keys = jobs.map(dedupKey);

    const existing = await this.jobRepo
      .createQueryBuilder('job')
      .select('job.dedup_key')
      .where('job.dedup_key IN (:...keys)', { keys })
      .getMany();

    const existingKeys = new Set(existing.map((j) => j.dedup_key));
    const now = new Date();

    for (const job of jobs) {
      const key = dedupKey(job);
      const tagsJson = JSON.stringify(job.tags);

      await this.jobRepo.query(
        `INSERT INTO jobs
           (dedup_key, source, source_job_id, title, company, url,
            posted_at, tags, remote, salary, description,
            fit_score, status, notion_page_id, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'New', NULL, ?, ?)
         ON CONFLICT(dedup_key) DO UPDATE SET
           title        = excluded.title,
           company      = excluded.company,
           url          = excluded.url,
           tags         = excluded.tags,
           salary       = excluded.salary,
           last_seen_at = excluded.last_seen_at`,
        [
          key,
          job.source,
          job.sourceJobId ?? null,
          job.title,
          job.company,
          job.url,
          job.postedAt?.toISOString() ?? null,
          tagsJson,
          job.remote ? 1 : 0,
          job.salary ?? null,
          job.description ?? null,
          now.toISOString(),
          now.toISOString(),
        ],
      );
    }

    const newKeys = keys.filter((k) => !existingKeys.has(k));
    if (newKeys.length === 0) return [];

    return this.jobRepo
      .createQueryBuilder('job')
      .where('job.dedup_key IN (:...newKeys)', { newKeys })
      .getMany();
  }
}
