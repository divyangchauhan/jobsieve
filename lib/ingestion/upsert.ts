import type { Database } from '../db/types';
import type { NormalizedJob } from './normalized-job.interface';
import type { StoredJob } from '../jobs';
import { contentKey } from './normalize';
import { dedupKey } from './dedup-key';
const PRIORITY = ['greenhouse', 'lever', 'ashby', 'web3career'];
const priority = (source: string) => {
  const n = PRIORITY.indexOf(source);
  return n < 0 ? PRIORITY.length : n;
};
// Preserve the existing TOAST value when only freshness changes. Reassigning
// identical incoming descriptions can otherwise rewrite large values to WAL.
const refreshedFields = {
  title:
    'CASE WHEN jobs.dedup_key=excluded.dedup_key THEN excluded.title ELSE jobs.title END',
  description:
    'CASE WHEN jobs.dedup_key=excluded.dedup_key AND excluded.description IS NOT NULL AND jobs.description IS DISTINCT FROM excluded.description THEN excluded.description ELSE jobs.description END',
  url: 'CASE WHEN jobs.dedup_key=excluded.dedup_key THEN excluded.url ELSE jobs.url END',
  tags: 'CASE WHEN jobs.dedup_key=excluded.dedup_key THEN excluded.tags ELSE jobs.tags END',
  salary:
    'CASE WHEN jobs.dedup_key=excluded.dedup_key THEN excluded.salary ELSE jobs.salary END',
  remote: 'jobs.remote OR excluded.remote',
  posted_at: 'LEAST(jobs.posted_at,excluded.posted_at)',
  alt_sources: `(SELECT COALESCE(jsonb_agg(DISTINCT a ORDER BY a),'[]'::jsonb) FROM jsonb_array_elements(jobs.alt_sources || excluded.alt_sources || CASE WHEN jobs.dedup_key<>excluded.dedup_key THEN jsonb_build_array(jsonb_build_object('source',excluded.source,'url',excluded.url)) ELSE '[]'::jsonb END) a)`,
};
export function safeUrl(value: string) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function upsertJobs(
  db: Database,
  incoming: readonly NormalizedJob[],
  discoveryEligible?: boolean,
): Promise<StoredJob[]>;
export function upsertJobs(
  db: Database,
  incoming: readonly NormalizedJob[],
  discoveryEligible: boolean,
  returning: 'ids',
): Promise<Pick<StoredJob, 'id'>[]>;
export async function upsertJobs(
  db: Database,
  incoming: readonly NormalizedJob[],
  discoveryEligible = false,
  returning: 'full' | 'ids' = 'full',
): Promise<Pick<StoredJob, 'id'>[]> {
  const groups = new Map<string, NormalizedJob[]>();
  // A feed can contain several versions of the same source ID. PostgreSQL
  // cannot update the same conflict row twice in a single INSERT.
  const bySourceKey = new Map<string, NormalizedJob>();
  for (const job of incoming) {
    const key = dedupKey(job);
    const previous = bySourceKey.get(key);
    bySourceKey.set(
      key,
      previous ? { ...job, remote: job.remote || previous.remote } : job,
    );
  }
  for (const job of bySourceKey.values()) {
    if (!job.title.trim() || !job.company.trim() || !safeUrl(job.url)) continue;
    const key = contentKey(job.company, job.title);
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  const records = [...groups.entries()].map(([key, group]) => {
    group.sort(
      (a, b) =>
        priority(a.source) - priority(b.source) ||
        Number(b.remote) - Number(a.remote),
    );
    const job = group[0];
    const dates = group
      .map((j) => j.postedAt)
      .filter((d): d is Date => !!d && Number.isFinite(d.getTime()));
    return {
      dedup_key: dedupKey(job),
      content_key: key,
      source: job.source,
      source_job_id: job.sourceJobId ?? null,
      title: job.title,
      company: job.company,
      url: job.url,
      posted_at: dates.length
        ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString()
        : null,
      tags: [...job.tags],
      remote: group.some((j) => j.remote),
      salary: job.salary ?? null,
      description: job.description ?? null,
      alt_sources: group
        .slice(1)
        .map((j) => ({ source: j.source, url: j.url })),
      discovery_eligible: discoveryEligible,
    };
  });
  const result: StoredJob[] = [];
  // Bound parameter size and DB work; all jobs in each chunk are persisted in one round trip.
  for (let offset = 0; offset < records.length; offset += 100) {
    const chunk = records.slice(offset, offset + 100);
    const { rows } = await db.query<StoredJob>(
      `WITH input AS MATERIALIZED (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(dedup_key text,content_key text,source text,source_job_id text,title text,company text,url text,posted_at timestamptz,tags jsonb,remote boolean,salary text,description text,alt_sources jsonb,discovery_eligible boolean)
      ), saved AS (
      INSERT INTO jobs(dedup_key,content_key,source,source_job_id,title,company,url,posted_at,tags,remote,salary,description,alt_sources,discovery_eligible)
      SELECT x.dedup_key,COALESCE(existing.content_key,x.content_key),x.source,x.source_job_id,x.title,x.company,x.url,x.posted_at,x.tags,x.remote,x.salary,x.description,x.alt_sources,x.discovery_eligible
      FROM input x
      LEFT JOIN jobs existing ON existing.dedup_key=x.dedup_key
      ON CONFLICT(content_key) DO UPDATE SET
        ${Object.entries(refreshedFields)
          .map(([field, expression]) => `${field}=${expression}`)
          .join(',')},
        last_seen_at=now()
      WHERE jobs.last_seen_at<now()-interval '1 hour'
        OR ROW(${Object.keys(refreshedFields)
          .map((field) => `jobs.${field}`)
          .join(
            ',',
          )}) IS DISTINCT FROM ROW(${Object.values(refreshedFields).join(',')})
      RETURNING ${returning === 'ids' ? 'id' : '*'}
      )
      SELECT * FROM saved
      UNION ALL
      SELECT ${returning === 'ids' ? 'j.id' : 'j.*'} FROM jobs j
      WHERE EXISTS (SELECT 1 FROM input x WHERE j.content_key=COALESCE((SELECT original.content_key FROM jobs original WHERE original.dedup_key=x.dedup_key),x.content_key))
      AND NOT EXISTS (SELECT 1 FROM saved WHERE saved.id=j.id)`,
      [JSON.stringify(chunk)],
    );
    // ON CONFLICT can wait for another insert that was invisible to this
    // statement's snapshot. Re-read with a new snapshot only when needed.
    if (rows.length < chunk.length) {
      const reread = await db.query<StoredJob>(
        `SELECT ${returning === 'ids' ? 'j.id' : 'j.*'} FROM jobs j WHERE EXISTS (
          SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS x(dedup_key text,content_key text)
          WHERE j.content_key=COALESCE((SELECT original.content_key FROM jobs original WHERE original.dedup_key=x.dedup_key),x.content_key)
        )`,
        [
          JSON.stringify(
            chunk.map(({ dedup_key, content_key }) => ({
              dedup_key,
              content_key,
            })),
          ),
        ],
      );
      const returned = new Set(rows.map((row) => row.id));
      rows.push(...reread.rows.filter((row) => !returned.has(row.id)));
    }
    result.push(...rows);
  }
  return result;
}
