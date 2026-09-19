import { loadEnvConfig } from '@next/env';
import { createPool } from '../lib/db/pool';
import { readFile, readdir } from 'node:fs/promises';
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL before running migrations');
  const pool = createPool(process.env.DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jobsieve-migrations'))",
    );
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir('migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const applied = await client.query(
        'SELECT name FROM schema_migrations WHERE name=$1',
        [name],
      );
      if (applied.rows.length) continue;
      await client.query(await readFile(`migrations/${name}`, 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [
        name,
      ]);
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
});
