import { loadEnvConfig } from '@next/env';
import Sqlite from 'better-sqlite3';
import { createPool } from '../lib/db/pool';
import { defaultProfile, profileSchema } from '../lib/profile/schema';
import { ensureUser } from '../lib/users';
import { upsertJobs } from '../lib/ingestion/upsert';
import { statusSchema } from '../lib/jobs';
import type { Database } from '../lib/db/types';
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
// Explicit owner is mandatory: legacy application statuses must never be copied to all users.
async function main() {
  const [file, owner] = process.argv.slice(2);
  if (!file || !owner?.startsWith('user_'))
    throw new Error(
      'Usage: pnpm db:import /absolute/path/jobsieve.sqlite user_CLERK_OWNER_ID',
    );
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL first');
  const sqlite = new Sqlite(file, { readonly: true, fileMustExist: true });
  const pool = createPool(process.env.DATABASE_URL);
  const connection = await pool.connect();
  const db = connection as unknown as Database;
  try {
    await connection.query('BEGIN');
    await ensureUser(db, owner, null);
    const profiles = sqlite
      .prepare('SELECT * FROM profile LIMIT 1')
      .all() as Record<string, unknown>[];
    if (profiles[0]) {
      const input = { ...defaultProfile(), ...profiles[0] };
      for (const field of [
        'roleFamilies',
        'seniorities',
        'stack',
        'locationTypes',
        'regionEligibility',
        'excludeTerms',
      ] as const)
        if (typeof input[field] === 'string')
          input[field] = JSON.parse(input[field] as unknown as string);
      const profile = profileSchema.parse(input);
      await db.query('UPDATE app_users SET profile=$2 WHERE id=$1', [
        owner,
        JSON.stringify(profile),
      ]);
    }
    const rows = sqlite
      .prepare('SELECT * FROM jobs ORDER BY id')
      .all() as Record<string, unknown>[];
    for (const row of rows) {
      const [job] = await upsertJobs(db, [
        {
          source: String(row.source),
          ...(row.source_job_id
            ? { sourceJobId: String(row.source_job_id) }
            : {}),
          title: String(row.title),
          company: String(row.company),
          url: String(row.url),
          tags: JSON.parse(String(row.tags ?? '[]')),
          remote: !!row.remote,
          ...(row.posted_at && row.source !== 'greenhouse'
            ? { postedAt: new Date(String(row.posted_at)) }
            : {}),
          ...(row.salary ? { salary: String(row.salary) } : {}),
          ...(row.description ? { description: String(row.description) } : {}),
        },
      ]);
      if (!job) continue;
      await db.query(
        'UPDATE jobs SET first_seen_at=LEAST(first_seen_at,$2::timestamptz),last_seen_at=GREATEST(last_seen_at,$3::timestamptz) WHERE id=$1',
        [job.id, row.first_seen_at, row.last_seen_at],
      );
      const parsed = statusSchema.safeParse(row.status);
      if (parsed.success && parsed.data !== 'New')
        await db.query(
          'INSERT INTO user_jobs(user_id,job_id,status) VALUES($1,$2,$3) ON CONFLICT(user_id,job_id) DO NOTHING',
          [owner, job.id, parsed.data],
        );
    }
    await connection.query('COMMIT');
    console.log(
      `Imported ${rows.length} legacy listings; private state belongs to ${owner}. Alerts remain disabled.`,
    );
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    sqlite.close();
    connection.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Import failed');
  process.exitCode = 1;
});
