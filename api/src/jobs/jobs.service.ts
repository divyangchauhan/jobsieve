import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NotionSyncService } from '../notion/notion-sync.service.js';
import { GetJobsQueryDto } from './dto/get-jobs-query.dto.js';
import { PaginatedJobsResponseDto } from './dto/paginated-jobs-response.dto.js';
import { JobStatus } from './dto/update-job-status.dto.js';
import { Job } from './job.entity.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly config: ConfigService,
    private readonly notionSync: NotionSyncService,
  ) {}

  async findAll(query: GetJobsQueryDto): Promise<PaginatedJobsResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const minFitScore =
      query.minFitScore ?? this.config.get<number>('MIN_FIT_SCORE', 0);

    const qb = this.jobRepo.createQueryBuilder('job');

    qb.where('(job.fit_score IS NULL OR job.fit_score >= :minFitScore)', {
      minFitScore,
    });
    qb.andWhere("job.status != 'Skipped'");

    if (query.status !== undefined) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    if (query.source !== undefined) {
      qb.andWhere('job.source = :source', { source: query.source });
    }

    if (query.remote !== undefined) {
      qb.andWhere('job.remote = :remote', { remote: query.remote ? 1 : 0 });
    }

    if (query.search !== undefined) {
      qb.andWhere('(job.title LIKE :search OR job.company LIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy('job.first_seen_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<Job> {
    const job = await this.jobRepo.findOneBy({ id });
    if (job === null) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return job;
  }

  async updateStatus(id: number, status: JobStatus): Promise<Job> {
    const job = await this.jobRepo.findOneBy({ id });
    if (job === null) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    await this.jobRepo.update(id, { status });
    return { ...job, status };
  }

  async syncToNotion(id: number): Promise<Job> {
    const job = await this.jobRepo.findOneBy({ id });
    if (job === null) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    await this.notionSync.pushJob(job);
    return this.jobRepo.findOneByOrFail({ id });
  }
}
