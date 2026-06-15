import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NotionSyncService } from '../notion/notion-sync.service.js';
import { Profile } from '../profile/profile.entity.js';
import { ProfileService } from '../profile/profile.service.js';
import { FitScoringService } from '../scoring/fit-scoring.service.js';
import { GetJobsQueryDto } from './dto/get-jobs-query.dto.js';
import { PaginatedJobsResponseDto } from './dto/paginated-jobs-response.dto.js';
import { JobStatus } from './dto/update-job-status.dto.js';
import { applyProfileFilters } from './job-query-filters.js';
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
    private readonly profileService: ProfileService,
    private readonly scoring: FitScoringService,
  ) {}

  async findAll(query: GetJobsQueryDto): Promise<PaginatedJobsResponseDto> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const profile = await this.profileService.getProfile();

    // Hard pre-filters in SQL shrink the candidate set before scoring.
    const survivors = await this.fetchSurvivors(query, profile);

    // Read-time scoring: reflects the current profile, not a frozen value.
    const minFitScore = this.resolveMinFitScore(query, profile);
    const ranked = survivors
      .map((job) => {
        job.fit_score = this.scoring.score(job, profile);
        return job;
      })
      .filter((job) => (job.fit_score ?? 0) >= minFitScore)
      .sort(byScoreThenRecency);

    const total = ranked.length;
    const data = ranked.slice((page - 1) * limit, (page - 1) * limit + limit);
    return { data, total, page, limit };
  }

  private async fetchSurvivors(
    query: GetJobsQueryDto,
    profile: Profile,
  ): Promise<Job[]> {
    const qb = this.jobRepo.createQueryBuilder('job');
    qb.where("job.status != 'Skipped'");

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

    applyProfileFilters(qb, profile);
    return qb.getMany();
  }

  // Query param overrides the profile, which overrides the env default.
  private resolveMinFitScore(
    query: GetJobsQueryDto,
    profile: Profile,
  ): number {
    return (
      query.minFitScore ??
      profile.minFitScore ??
      this.config.get<number>('MIN_FIT_SCORE', 0)
    );
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

function byScoreThenRecency(a: Job, b: Job): number {
  const scoreDiff = (b.fit_score ?? 0) - (a.fit_score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  return b.first_seen_at.getTime() - a.first_seen_at.getTime();
}
