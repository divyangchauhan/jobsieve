import { beforeAll, afterAll, it, expect } from 'vitest';
import { testDatabase } from './database';
import Sqlite from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaultProfile } from '../lib/profile/schema';
const run = promisify(execFile);
let ctx: Awaited<ReturnType<typeof testDatabase>>;
let directory: string;
beforeAll(async () => {
  ctx = await testDatabase();
  directory = mkdtempSync(join(tmpdir(), 'jobsieve-import-'));
});
afterAll(async () => {
  await ctx.close();
  rmSync(directory, { recursive: true, force: true });
});
it('imports a legacy SQLite snapshot into Postgres without losing ownership, status or timestamps', async () => {
  const file = join(directory, 'legacy.sqlite');
  const sqlite = new Sqlite(file);
  sqlite.exec(
    'CREATE TABLE profile(id integer,roleFamilies text,seniorities text,stack text,locationTypes text,regionEligibility text,excludeTerms text,freshnessDays integer,minFitScore integer); CREATE TABLE jobs(id integer,source text,source_job_id text,title text,company text,url text,tags text,remote integer,posted_at text,salary text,description text,status text,first_seen_at text,last_seen_at text)',
  );
  const p = defaultProfile();
  sqlite
    .prepare('INSERT INTO profile VALUES(1,?,?,?,?,?,?,?,?)')
    .run(
      JSON.stringify(p.roleFamilies),
      JSON.stringify(p.seniorities),
      JSON.stringify(p.stack),
      JSON.stringify(p.locationTypes),
      JSON.stringify(p.regionEligibility),
      JSON.stringify(p.excludeTerms),
      null,
      null,
    );
  sqlite
    .prepare('INSERT INTO jobs VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      'ashby',
      '123',
      'Senior Backend Engineer',
      'Acme',
      'https://example.com/job',
      '["typescript"]',
      1,
      '2026-01-01T00:00:00Z',
      null,
      'Description',
      'Applied',
      '2026-01-02T00:00:00Z',
      '2026-01-03T00:00:00Z',
    );
  sqlite.close();
  const schema = (await ctx.pool.query('SELECT current_schema() AS name'))
    .rows[0].name;
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      'postgresql://jobsieve_test:jobsieve_test@localhost:5432/jobsieve_test',
  );
  url.searchParams.set('options', `-c search_path=${schema}`);
  await run(
    'pnpm',
    ['exec', 'tsx', 'scripts/import-sqlite.ts', file, 'user_legacy'],
    { env: { ...process.env, DATABASE_URL: url.toString() } },
  );
  const { rows } = await ctx.db.query<{ user_id: string; status: string }>(
    'SELECT * FROM user_jobs',
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ user_id: 'user_legacy', status: 'Applied' });
  expect(
    (
      await ctx.db.query<{ first_seen_at: Date }>(
        'SELECT first_seen_at FROM jobs',
      )
    ).rows[0].first_seen_at.toISOString(),
  ).toBe('2026-01-02T00:00:00.000Z');
  expect(
    (
      await ctx.db.query<{ alert_settings: { enabled: boolean } }>(
        'SELECT alert_settings FROM app_users',
      )
    ).rows[0].alert_settings.enabled,
  ).toBe(false);
  await ctx.db.query("UPDATE user_jobs SET status='Reviewing'");
  await run(
    'pnpm',
    ['exec', 'tsx', 'scripts/import-sqlite.ts', file, 'user_legacy'],
    { env: { ...process.env, DATABASE_URL: url.toString() } },
  );
  expect(
    (await ctx.db.query<{ status: string }>('SELECT status FROM user_jobs'))
      .rows[0].status,
  ).toBe('Reviewing');
});
