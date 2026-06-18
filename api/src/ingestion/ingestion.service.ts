import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Job } from '../jobs/job.entity.js';
import { dedupKey } from './dedup-key.js';
import { contentKey } from './normalize.js';
import { NormalizedJob } from './normalized-job.interface.js';

// Lower index = higher priority for canonical selection.
const SOURCE_PRIORITY = ['greenhouse', 'lever', 'ashby', 'web3career'] as const;

function sourcePriority(source: string): number {
  const idx = (SOURCE_PRIORITY as ReadonlyArray<string>).indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

function pickCanonical(jobs: NormalizedJob[]): NormalizedJob {
  return jobs.reduce((best, job) => {
    const bp = sourcePriority(best.source);
    const jp = sourcePriority(job.source);
    if (jp < bp) return job;
    if (jp > bp) return best;
    // Prefer remote member so multi-location roles aren't hidden by the remote filter.
    if (job.remote && !best.remote) return job;
    if (!job.remote && best.remote) return best;
    const bd = best.postedAt?.getTime() ?? Infinity;
    const jd = job.postedAt?.getTime() ?? Infinity;
    return jd < bd ? job : best;
  });
}

type AltSource = { source: string; url: string };

function mergeAltSources(
  existing: ReadonlyArray<AltSource>,
  incoming: ReadonlyArray<AltSource>,
): AltSource[] {
  const seen = new Set(existing.map((a) => `${a.source}:${a.url}`));
  const result = [...existing];
  for (const alt of incoming) {
    const k = `${alt.source}:${alt.url}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push(alt);
    }
  }
  return result;
}

@Injectable()
export class IngestionService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
  ) {}

  async upsert(jobs: NormalizedJob[]): Promise<Job[]> {
    if (jobs.length === 0) return [];

    // Step 1: batch-dedup incoming by content_key — one canonical per group.
    const batchByContentKey = new Map<string, NormalizedJob[]>();
    for (const job of jobs) {
      const ck = contentKey(job.company, job.title);
      const group = batchByContentKey.get(ck) ?? [];
      group.push(job);
      batchByContentKey.set(ck, group);
    }

    const canonicals: Array<{
      job: NormalizedJob;
      ck: string;
      dk: string;
      batchAlts: AltSource[];
      groupRemote: boolean;
    }> = [];

    for (const [ck, group] of batchByContentKey) {
      const canonical = pickCanonical(group);
      const dk = dedupKey(canonical);
      const groupRemote = group.some((j) => j.remote);
      const batchAlts = group
        .filter((j) => j !== canonical)
        .map((j) => ({ source: j.source, url: j.url }));
      canonicals.push({ job: canonical, ck, dk, batchAlts, groupRemote });
    }

    // Step 2: DB lookups — content_key for cross-source dedup, dedup_key for new-row tracking.
    const [byContentKey, byDedupKey] = await Promise.all([
      this.findByContentKeys(canonicals.map((c) => c.ck)),
      this.findByDedupKeys(canonicals.map((c) => c.dk)),
    ]);

    const now = new Date();
    const newDedupKeys: string[] = [];

    for (const { job, ck, dk, batchAlts, groupRemote } of canonicals) {
      const dbByContent = byContentKey.get(ck);
      const isCrossSourceDup =
        dbByContent !== undefined && dbByContent.dedup_key !== dk;

      if (isCrossSourceDup) {
        // Don't insert a second row — merge incoming data into the existing canonical.
        await this.mergeContentDuplicate(
          dbByContent,
          job,
          batchAlts,
          groupRemote,
          now,
        );
        continue;
      }

      // Normal dedup_key upsert (new insertion or re-ingest of same source).
      const dbByDedup = byDedupKey.get(dk);
      if (dbByDedup === undefined) newDedupKeys.push(dk);

      const existingAlts = (dbByContent ?? dbByDedup)?.alt_sources ?? [];
      const allAlts = mergeAltSources(existingAlts, batchAlts);
      const tagsJson = JSON.stringify(job.tags);

      await this.jobRepo.query(
        `INSERT INTO jobs
           (dedup_key, content_key, source, source_job_id, title, company, url,
            posted_at, tags, remote, salary, description,
            fit_score, status, notion_page_id, alt_sources, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'New', NULL, ?, ?, ?)
         ON CONFLICT(dedup_key) DO UPDATE SET
           title        = excluded.title,
           company      = excluded.company,
           url          = excluded.url,
           tags         = excluded.tags,
           salary       = excluded.salary,
           remote       = MAX(jobs.remote, excluded.remote),
           content_key  = excluded.content_key,
           alt_sources  = excluded.alt_sources,
           last_seen_at = excluded.last_seen_at`,
        [
          dk,
          ck,
          job.source,
          job.sourceJobId ?? null,
          job.title,
          job.company,
          job.url,
          job.postedAt?.toISOString() ?? null,
          tagsJson,
          groupRemote ? 1 : 0,
          job.salary ?? null,
          job.description ?? null,
          allAlts.length > 0 ? JSON.stringify(allAlts) : null,
          now.toISOString(),
          now.toISOString(),
        ],
      );
    }

    if (newDedupKeys.length === 0) return [];

    return this.jobRepo
      .createQueryBuilder('job')
      .where('job.dedup_key IN (:...newDedupKeys)', { newDedupKeys })
      .getMany();
  }

  private async findByContentKeys(
    contentKeys: string[],
  ): Promise<Map<string, Job>> {
    if (contentKeys.length === 0) return new Map();
    const rows = await this.jobRepo
      .createQueryBuilder('job')
      .where('job.content_key IN (:...contentKeys)', { contentKeys })
      .getMany();
    return new Map(rows.map((r) => [r.content_key as string, r]));
  }

  private async findByDedupKeys(
    dedupKeys: string[],
  ): Promise<Map<string, Job>> {
    if (dedupKeys.length === 0) return new Map();
    const rows = await this.jobRepo
      .createQueryBuilder('job')
      .where('job.dedup_key IN (:...dedupKeys)', { dedupKeys })
      .getMany();
    return new Map(rows.map((r) => [r.dedup_key, r]));
  }

  private async mergeContentDuplicate(
    canonical: Job,
    incoming: NormalizedJob,
    batchAlts: AltSource[],
    groupRemote: boolean,
    now: Date,
  ): Promise<void> {
    const currentAlts = canonical.alt_sources ?? [];
    const newAlts = mergeAltSources(currentAlts, [
      { source: incoming.source, url: incoming.url },
      ...batchAlts,
    ]);

    const incomingPostedAt = incoming.postedAt?.toISOString() ?? null;
    const canonicalPostedAt = canonical.posted_at?.toISOString() ?? null;
    let mergedPostedAt = canonicalPostedAt;
    if (incomingPostedAt !== null) {
      if (canonicalPostedAt === null || incomingPostedAt < canonicalPostedAt) {
        mergedPostedAt = incomingPostedAt;
      }
    }

    // OR the remote flag: if any member of the group (existing or incoming) is remote, mark canonical remote.
    const mergedRemote = canonical.remote || groupRemote;

    await this.jobRepo.query(
      `UPDATE jobs SET
         alt_sources  = ?,
         posted_at    = ?,
         remote       = ?,
         last_seen_at = ?
       WHERE id = ?`,
      [
        newAlts.length > 0 ? JSON.stringify(newAlts) : null,
        mergedPostedAt,
        mergedRemote ? 1 : 0,
        now.toISOString(),
        canonical.id,
      ],
    );
  }
}
