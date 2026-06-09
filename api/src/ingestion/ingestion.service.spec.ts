import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Job } from '../jobs/job.entity.js';
import { IngestionService } from './ingestion.service.js';
import { NormalizedJob } from './normalized-job.interface.js';

const BASE_JOB: NormalizedJob = {
  source: 'test',
  sourceJobId: 'abc123',
  title: 'Senior Engineer',
  company: 'Acme',
  url: 'https://example.com/job/abc123',
  tags: ['typescript', 'node'],
  remote: true,
};

describe('IngestionService', () => {
  let service: IngestionService;
  let repo: Repository<Job>;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Job],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([Job]),
      ],
      providers: [IngestionService],
    }).compile();

    service = module.get(IngestionService);
    repo = module.get<Repository<Job>>(getRepositoryToken(Job));
  });

  afterEach(async () => {
    await module.close();
  });

  it('fresh insert sets status to New', async () => {
    const newJobs = await service.upsert([BASE_JOB]);

    expect(newJobs).toHaveLength(1);
    expect(newJobs[0]?.status).toBe('New');
    expect(newJobs[0]?.title).toBe('Senior Engineer');
  });

  it('re-ingest after status change preserves user status', async () => {
    await service.upsert([BASE_JOB]);

    await repo.update({ dedup_key: 'test:abc123' }, { status: 'Applied' });

    const updatedJob: NormalizedJob = {
      ...BASE_JOB,
      title: 'Senior Engineer (Updated)',
    };
    const newJobs = await service.upsert([updatedJob]);

    expect(newJobs).toHaveLength(0);

    const stored = await repo.findOneByOrFail({ dedup_key: 'test:abc123' });
    expect(stored.status).toBe('Applied');
    expect(stored.title).toBe('Senior Engineer (Updated)');
  });

  it('re-ingest returns empty array for already-known jobs', async () => {
    await service.upsert([BASE_JOB]);
    const newJobs = await service.upsert([BASE_JOB]);

    expect(newJobs).toHaveLength(0);
  });

  it('re-ingest updates mutable fields but not first_seen_at', async () => {
    await service.upsert([BASE_JOB]);
    const before = await repo.findOneByOrFail({ dedup_key: 'test:abc123' });

    const updated: NormalizedJob = {
      ...BASE_JOB,
      salary: '$200k',
      company: 'NewCo',
    };
    await service.upsert([updated]);

    const after = await repo.findOneByOrFail({ dedup_key: 'test:abc123' });
    expect(after.salary).toBe('$200k');
    expect(after.company).toBe('NewCo');
    expect(after.first_seen_at.getTime()).toBe(before.first_seen_at.getTime());
  });

  it('batch upsert returns only new rows', async () => {
    const job2: NormalizedJob = {
      ...BASE_JOB,
      sourceJobId: 'xyz789',
      title: 'Staff Engineer',
    };

    await service.upsert([BASE_JOB]);
    const newJobs = await service.upsert([BASE_JOB, job2]);

    expect(newJobs).toHaveLength(1);
    expect(newJobs[0]?.dedup_key).toBe('test:xyz789');
  });

  it('empty input returns empty array', async () => {
    const result = await service.upsert([]);
    expect(result).toEqual([]);
  });
});
