import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testDatabase } from './database';
import { normalized } from './fixtures';
import { upsertJobs } from '../lib/ingestion/upsert';
import { ensureUser, saveProfile } from '../lib/users';
import { allowRequest, runBatch } from '../lib/ingestion/run';
import { sourceBatches, sourceIntervalSeconds } from '../lib/ingestion/sources';
import { claimDelivery, enqueueAlerts } from '../lib/alerts/queue';
import { defaultAlerts } from '../lib/alerts/schema';
import type { Database } from '../lib/db/types';

let ctx: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  ctx = await testDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

it('returns a concurrently inserted job after waiting for its commit', async () => {
  const client = await ctx.pool.connect();
  const writer: Database = {
    async query<T>(text: string, values: unknown[] = []) {
      return { rows: (await client.query(text, values)).rows as T[] };
    },
  };
  let pending: ReturnType<typeof upsertJobs> | undefined;
  try {
    await client.query('BEGIN');
    const [first] = await upsertJobs(writer, [normalized]);
    pending = upsertJobs(ctx.db, [normalized], false, 'ids');
    // Wait for the second connection to reach the conflicting insert.
    await vi.waitFor(async () => {
      const { rows } = await ctx.db.query<{ blocked: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%WITH input AS MATERIALIZED%') AS blocked",
      );
      expect(rows[0].blocked).toBe(true);
    });
    await client.query('COMMIT');
    expect(await pending).toEqual([{ id: first.id }]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pending;
  }
});

it('does not return an unrelated job when a source ID is retitled to its title', async () => {
  const [first] = await upsertJobs(ctx.db, [
    { ...normalized, title: 'Alpha Backend' },
  ]);
  await upsertJobs(ctx.db, [
    { ...normalized, sourceJobId: 'beta', title: 'Beta Backend' },
  ]);
  const renamed = { ...normalized, title: 'Beta Backend' };
  expect(await upsertJobs(ctx.db, [renamed], false, 'ids')).toEqual([
    { id: first.id },
  ]);
  expect(await upsertJobs(ctx.db, [renamed], false, 'ids')).toEqual([
    { id: first.id },
  ]);
});

it('anchors successful cooldown to the poll start rather than drifting past the next cron', async () => {
  const adapter = {
    name: 'test',
    fetchJobs: async () => {
      await ctx.db.query(
        "UPDATE ingestion_state SET lease_until=lease_until-interval '2 minutes'",
      );
      return [normalized];
    },
  };
  await runBatch(ctx.db, 'remoteok', adapter);
  const { rows } = await ctx.db.query<{ delay: number }>(
    'SELECT extract(epoch FROM next_run_at-now())::float AS delay FROM ingestion_state',
  );
  expect(rows[0].delay).toBeGreaterThan(3400);
  expect(rows[0].delay).toBeLessThanOrEqual(3450);
});

it('does not rewrite unchanged jobs, including large descriptions, on repeated ingestion', async () => {
  const job = {
    ...normalized,
    description: 'Backend engineering '.repeat(6000),
  };
  const [first] = await upsertJobs(ctx.db, [job]);
  const version = async () =>
    (
      await ctx.db.query<{ version: string }>(
        'SELECT xmin::text AS version FROM jobs WHERE id=$1',
        [first.id],
      )
    ).rows[0].version;
  const original = await version();
  for (let i = 0; i < 5; i++) {
    expect(await upsertJobs(ctx.db, [job], true, 'ids')).toEqual([
      { id: first.id },
    ]);
  }
  expect(await version()).toBe(original);
  expect((await upsertJobs(ctx.db, [job]))[0].description).toBe(
    job.description,
  );
  await upsertJobs(ctx.db, [{ ...job, description: 'Changed Backend role' }]);
  expect(await version()).not.toBe(original);
});

it('refreshes stale last-seen without changing first-seen or descriptions', async () => {
  const [first] = await upsertJobs(ctx.db, [normalized]);
  await ctx.db.query("UPDATE jobs SET last_seen_at=now()-interval '2 hours'");
  const [refreshed] = await upsertJobs(ctx.db, [normalized]);
  expect(refreshed.last_seen_at.getTime()).toBeGreaterThan(Date.now() - 10000);
  expect(refreshed.first_seen_at).toEqual(first.first_seen_at);
  expect(refreshed.description).toBe(first.description);
});

it('deduplicates concurrent unchanged refreshes without rewriting records', async () => {
  const [first] = await upsertJobs(ctx.db, [normalized]);
  const before = (await ctx.db.query('SELECT xmin::text FROM jobs')).rows;
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      upsertJobs(ctx.db, [normalized], true, 'ids'),
    ),
  );
  expect(results).toEqual(Array.from({ length: 5 }, () => [{ id: first.id }]));
  expect((await ctx.db.query('SELECT xmin::text FROM jobs')).rows).toEqual(
    before,
  );
});

it('reads an unchanged identity without rewriting it and still refreshes verified email', async () => {
  const user = await ensureUser(ctx.db, 'a', 'a@example.com');
  const before = (await ctx.db.query('SELECT xmin::text FROM app_users')).rows;
  await Promise.all(
    Array.from({ length: 5 }, () => ensureUser(ctx.db, 'a', 'a@example.com')),
  );
  await saveProfile(ctx.db, 'a', user.profile);
  expect((await ctx.db.query('SELECT xmin::text FROM app_users')).rows).toEqual(
    before,
  );
  expect((await ensureUser(ctx.db, 'a', null)).email).toBeNull();
  expect((await ensureUser(ctx.db, 'a', 'new@example.com')).profile).toEqual(
    user.profile,
  );
});

it('shares successful source cooldowns across callers', async () => {
  const fetchJobs = vi.fn().mockResolvedValue([normalized]);
  const source = sourceBatches.find((key) => key.startsWith('ashby:'))!;
  await runBatch(ctx.db, source, { name: 'test', fetchJobs });
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      runBatch(ctx.db, source, { name: 'test', fetchJobs }),
    ),
  );
  expect(attempts.every((r) => r.status === 'skipped')).toBe(true);
  expect(fetchJobs).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'applies source cooldown after failed or partially failed requests: %s',
  async (partial) => {
    const fetchJobs = partial
      ? vi.fn().mockResolvedValue([normalized])
      : vi.fn().mockRejectedValue(Error('outage'));
    const adapter = { name: 'test', fetchJobs, failures: partial ? 1 : 0 };
    expect((await runBatch(ctx.db, 'remoteok', adapter)).status).toBe('failed');
    expect((await runBatch(ctx.db, 'remoteok', adapter)).status).toBe(
      'skipped',
    );
    expect(fetchJobs).toHaveBeenCalledTimes(1);
    const { rows } = await ctx.db.query<{ delay: number }>(
      'SELECT extract(epoch FROM next_run_at-now())::float AS delay FROM ingestion_state',
    );
    expect(rows[0].delay).toBeGreaterThan(
      sourceIntervalSeconds('remoteok') - 10,
    );
  },
);

it('a manual alert scan visits only the requesting account', async () => {
  for (const id of ['a', 'b']) {
    await ensureUser(ctx.db, id, null);
    await ctx.db.query('UPDATE app_users SET alert_settings=$2 WHERE id=$1', [
      id,
      JSON.stringify({
        ...defaultAlerts(),
        enabled: true,
        channels: ['push'],
        enabledAt: new Date(Date.now() - 10000).toISOString(),
      }),
    ]);
  }
  await upsertJobs(ctx.db, [{ ...normalized, postedAt: new Date() }]);
  expect(await enqueueAlerts(ctx.db, new Date(), 'a')).toBe(1);
  expect(
    (await ctx.db.query('SELECT user_id FROM notification_outbox')).rows,
  ).toEqual([{ user_id: 'a' }]);
  expect(await enqueueAlerts(ctx.db)).toBe(1);
});

it('exhausts expired crash leases after five attempts and allows the next job through', async () => {
  await ensureUser(ctx.db, 'a', null);
  const jobs = await upsertJobs(ctx.db, [
    normalized,
    { ...normalized, title: 'Other Backend Engineer', sourceJobId: 'other' },
  ]);
  for (const job of jobs)
    await ctx.db.query(
      "INSERT INTO notification_outbox(user_id,job_id,channel) VALUES('a',$1,'push')",
      [job.id],
    );
  for (let i = 0; i < 5; i++) {
    expect((await claimDelivery(ctx.db))?.attempts).toBe(i + 1);
    await ctx.db.query(
      "UPDATE notification_outbox SET lease_until=now()-interval '1 second' WHERE id=1",
    );
  }
  expect((await claimDelivery(ctx.db))?.id).toBe(2);
  expect(
    (
      await ctx.db.query<{ status: string }>(
        'SELECT status FROM notification_outbox WHERE id=1',
      )
    ).rows[0].status,
  ).toBe('failed');
});

it('allows only one global notification worker inside its runtime window', async () => {
  const acquired = await Promise.all(
    Array.from({ length: 5 }, () =>
      allowRequest(ctx.db, 'cron:notifications', 300),
    ),
  );
  expect(acquired.filter(Boolean)).toHaveLength(1);
});

it('schedules every source and the notification worker once daily', () => {
  const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    crons: { path: string; schedule: string }[];
  };
  for (const cron of crons) {
    expect(cron.schedule).toBe(
      cron.path === '/api/cron/notifications' ? '5 0 * * *' : '0 0 * * *',
    );
  }
  expect(crons).toHaveLength(sourceBatches.length + 1);
  expect(
    crons.find((c) => c.path === '/api/cron/notifications')?.schedule,
  ).toBe('5 0 * * *');
  expect(
    crons
      .filter((c) => c.path.startsWith('/api/cron/ingest'))
      .map((c) =>
        new URL(c.path, 'https://jobsieve.example').searchParams.get('source'),
      )
      .sort(),
  ).toEqual([...sourceBatches].sort());
});
