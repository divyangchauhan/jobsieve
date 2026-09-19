import { randomUUID } from 'node:crypto';
import type { Database } from '../db/types';
import { adapterFor, sourceBatches, sourceIntervalSeconds } from './sources';
import { upsertJobs } from './upsert';
import type { SourceAdapter } from './source-adapter.interface';
const LEASE_SECONDS = 260;
const SCHEDULE_GRACE_SECONDS = 30;
export async function runBatch(
  db: Database,
  key: string,
  adapter?: SourceAdapter,
) {
  if (!sourceBatches.includes(key)) throw new Error('Unknown source batch');
  const token = randomUUID();
  const {
    rows: [state],
  } = await db.query<{ last_success_at: Date | null }>(
    `INSERT INTO ingestion_state(source,lease_token,lease_until) VALUES($1,$2,now()+($3 * interval '1 second')) ON CONFLICT(source) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE (ingestion_state.lease_until IS NULL OR ingestion_state.lease_until<now()) AND ingestion_state.next_run_at<=now() RETURNING last_success_at`,
    [key, token, LEASE_SECONDS],
  );
  if (!state) return { source: key, status: 'skipped' as const, count: 0 };
  try {
    const source = adapter ?? adapterFor(key);
    const jobs = await source.fetchJobs();
    const saved = await upsertJobs(db, jobs, !!state.last_success_at, 'ids');
    if (source.failures) {
      await db.query(
        "UPDATE ingestion_state SET lease_until=NULL,lease_token=NULL,next_run_at=now()+($3 * interval '1 second'),last_error='Some source requests failed; available jobs were saved' WHERE source=$1 AND lease_token=$2",
        [key, token, sourceIntervalSeconds(key)],
      );
      return { source: key, status: 'failed' as const, count: saved.length };
    }
    await db.query(
      `UPDATE ingestion_state SET lease_until=NULL,lease_token=NULL,next_run_at=GREATEST(now(),lease_until+(($3::integer-$4::integer) * interval '1 second')),last_success_at=now(),last_error=NULL WHERE source=$1 AND lease_token=$2`,
      [
        key,
        token,
        sourceIntervalSeconds(key),
        LEASE_SECONDS + SCHEDULE_GRACE_SECONDS,
      ],
    );
    return { source: key, status: 'complete' as const, count: saved.length };
  } catch {
    await db.query(
      `UPDATE ingestion_state SET lease_until=NULL,lease_token=NULL,next_run_at=now()+($3 * interval '1 second'),last_error='Source ingestion failed' WHERE source=$1 AND lease_token=$2`,
      [key, token, sourceIntervalSeconds(key)],
    );
    return { source: key, status: 'failed' as const, count: 0 };
  }
}
export async function allowRequest(db: Database, key: string, seconds: number) {
  const { rows } = await db.query(
    `INSERT INTO rate_limits(key,next_allowed_at) VALUES($1,now()+($2 * interval '1 second')) ON CONFLICT(key) DO UPDATE SET next_allowed_at=excluded.next_allowed_at WHERE rate_limits.next_allowed_at<=now() RETURNING key`,
    [key, seconds],
  );
  return rows.length > 0;
}
