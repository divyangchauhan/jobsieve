import { z } from 'zod';
import type { Database } from './db/types';
import type { Profile } from './profile/schema';
import { FitScoringService } from './scoring/fit-scoring.service';
import { matchesPhrase, matchesAny } from './scoring/phrase-match';
import {
  REGION_LOCK_TERMS,
  UNRESTRICTED_REGIONS,
  resolveRoleKeywords,
} from './scoring/taxonomy';
import { COMPANIES } from './registry/company-registry';
import { jobSelection } from './job-selection';
export type JobStatus = 'New' | 'Reviewing' | 'Applied' | 'Skipped';
export const statusSchema = z.enum(['New', 'Reviewing', 'Applied', 'Skipped']);
export const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: statusSchema.optional(),
  source: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  remote: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  minFitScore: z.coerce.number().min(0).max(100).optional(),
});
export interface StoredJob {
  id: number;
  dedup_key: string;
  content_key: string;
  source: string;
  source_job_id: string | null;
  title: string;
  company: string;
  url: string;
  posted_at: Date | null;
  tags: string[];
  remote: boolean;
  salary: string | null;
  description: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  alt_sources: { source: string; url: string }[];
  status: JobStatus;
}
export type JobSummary = Pick<
  StoredJob,
  | 'id'
  | 'source'
  | 'title'
  | 'company'
  | 'url'
  | 'posted_at'
  | 'tags'
  | 'remote'
  | 'salary'
  | 'first_seen_at'
  | 'last_seen_at'
  | 'status'
>;
export function matchesProfile(
  job: StoredJob,
  profile: Profile,
  now = new Date(),
): boolean {
  const title = job.title.toLowerCase();
  const text =
    `${job.title} ${job.description ?? ''} ${job.tags.join(' ')}`.toLowerCase();
  if (matchesAny(title, profile.excludeTerms)) return false;
  if (
    profile.locationTypes.length &&
    !profile.locationTypes.some((t) =>
      t === 'remote'
        ? job.remote
        : t === 'hybrid'
          ? text.includes('hybrid')
          : /on[- ]?site/.test(text),
    )
  )
    return false;
  if (
    profile.regionEligibility.length &&
    !profile.regionEligibility.some((r) => UNRESTRICTED_REGIONS.has(r))
  ) {
    if (
      Object.entries(REGION_LOCK_TERMS).some(
        ([r, phrases]) =>
          !profile.regionEligibility.includes(r) &&
          phrases.some((p) => text.includes(p.toLowerCase())),
      )
    )
      return false;
  }
  if (
    profile.freshnessDays !== null &&
    job.last_seen_at.getTime() <
      now.getTime() - profile.freshnessDays * 86400000
  )
    return false;
  const companies = profile.companies ?? [];
  const companyKeywords = profile.companyKeywords ?? [];
  const registry = COMPANIES.find(
    (c) => c.name.toLowerCase() === job.company.toLowerCase(),
  );
  const companyText = `${job.company} ${registry?.domain ?? ''}`.toLowerCase();
  if (
    (companies.length || companyKeywords.length) &&
    !companies.some((c) => c.toLowerCase() === job.company.toLowerCase()) &&
    !companyKeywords.some((k) => companyText.includes(k.toLowerCase()))
  )
    return false;
  if (
    (profile.jobKeywords ?? []).length &&
    !matchesAny(text, profile.jobKeywords)
  )
    return false;
  return true;
}
export function matchesAlertRole(job: StoredJob, profile: Profile): boolean {
  return (
    !profile.roleFamilies.length ||
    matchesAny(
      `${job.title} ${job.description ?? ''}`.toLowerCase(),
      resolveRoleKeywords(profile.roleFamilies),
    )
  );
}
export function score(job: StoredJob, profile: Profile): number {
  return new FitScoringService().score(job, profile);
}
export async function listJobs(
  db: Database,
  userId: string,
  profile: Profile,
  query: z.infer<typeof querySchema>,
) {
  const s = jobSelection(profile, userId);
  s.where.push(
    query.status
      ? `${s.status}=${s.param(query.status)}`
      : `${s.status}<>'Skipped'`,
  );
  if (query.source !== undefined)
    s.where.push(`j.source=${s.param(query.source)}`);
  if (query.remote !== undefined)
    s.where.push(`j.remote=${s.param(query.remote)}`);
  if (query.search) {
    const search = s.param(`%${query.search.replace(/[\\%_]/g, '\\$&')}%`);
    s.where.push(
      `(j.title ILIKE ${search} ESCAPE '\\' OR j.company ILIKE ${search} ESCAPE '\\')`,
    );
  }
  const minimumScore = s.param(query.minFitScore ?? profile.minFitScore ?? 0);
  const limit = s.param(query.limit),
    offset = s.param((query.page - 1) * query.limit);
  const { rows } = await db.query<
    JobSummary & { fit_score: number; total: number }
  >(
    `WITH ranked AS MATERIALIZED (
      SELECT j.id,j.first_seen_at,${s.status} AS status,${s.score} AS fit_score
      FROM jobs j ${s.join} WHERE ${s.where.join(' AND ')}
    ), eligible AS (
      SELECT * FROM ranked WHERE fit_score>=${minimumScore}
    ), page AS (
      SELECT * FROM eligible ORDER BY fit_score DESC,first_seen_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}
    ), total AS (SELECT count(*)::integer AS total FROM eligible)
    SELECT j.id,j.source,j.title,j.company,j.url,j.posted_at,j.tags,
      j.remote,j.salary,j.first_seen_at,j.last_seen_at,
      page.status,page.fit_score,total.total FROM total
    LEFT JOIN page ON true LEFT JOIN jobs j ON j.id=page.id
    ORDER BY page.fit_score DESC,page.first_seen_at DESC,page.id DESC`,
    s.values,
  );
  return {
    data: rows
      .filter((row) => row.id !== null)
      .map(({ total: _total, ...job }) => job),
    total: rows[0]?.total ?? 0,
    page: query.page,
    limit: query.limit,
  };
}
export async function getJob(
  db: Database,
  userId: string,
  jobId: number,
  profile: Profile,
) {
  const {
    rows: [job],
  } = await db.query<StoredJob>(
    `SELECT j.*, COALESCE(u.status,'New') AS status FROM jobs j LEFT JOIN user_jobs u ON u.job_id=j.id AND u.user_id=$1 WHERE j.id=$2`,
    [userId, jobId],
  );
  return job ? { ...job, fit_score: score(job, profile) } : null;
}
export async function updateStatus(
  db: Database,
  userId: string,
  jobId: number,
  status: JobStatus,
) {
  const { rows } = await db.query(
    `INSERT INTO user_jobs(user_id,job_id,status) SELECT $1,id,$3 FROM jobs WHERE id=$2 ON CONFLICT(user_id,job_id) DO UPDATE SET status=excluded.status,updated_at=now() RETURNING job_id`,
    [userId, jobId, status],
  );
  return rows.length > 0;
}
