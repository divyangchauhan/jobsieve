import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Database } from '../lib/db/types';
export async function testDatabase() {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgresql://jobsieve_test:jobsieve_test@localhost:5432/jobsieve_test';
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  await pool.query(readFileSync('migrations/001-initial.sql', 'utf8'));
  return {
    db: pool as unknown as Database,
    pool,
    reset: () =>
      pool.query(
        'TRUNCATE app_users,jobs,user_jobs,push_subscriptions,notification_outbox,ingestion_state,rate_limits RESTART IDENTITY CASCADE',
      ),
    close: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
