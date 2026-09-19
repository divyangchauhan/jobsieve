import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { testDatabase } from './database';
import { normalized } from './fixtures';
import { upsertJobs } from '../lib/ingestion/upsert';
import { ensureUser, saveProfile } from '../lib/users';
import { getJob, listJobs, querySchema, updateStatus } from '../lib/jobs';
import { defaultProfile } from '../lib/profile/schema';
import { allowRequest, runBatch } from '../lib/ingestion/run';
let ctx: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  ctx = await testDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  await ensureUser(ctx.db, 'user_a', 'a@example.com');
  await ensureUser(ctx.db, 'user_b', 'b@example.com');
});
describe('Postgres ingestion and tenant isolation', () => {
  it('inserts, refreshes descriptions, and preserves first-seen and private status', async () => {
    const [first] = await upsertJobs(ctx.db, [normalized]);
    await updateStatus(ctx.db, 'user_a', first.id, 'Applied');
    await upsertJobs(ctx.db, [
      { ...normalized, description: 'Updated description', salary: '$100k' },
    ]);
    const a = await getJob(ctx.db, 'user_a', first.id, defaultProfile());
    const b = await getJob(ctx.db, 'user_b', first.id, defaultProfile());
    expect(a?.status).toBe('Applied');
    expect(b?.status).toBe('New');
    expect(a?.first_seen_at).toEqual(first.first_seen_at);
    expect(a?.description).toBe('Updated description');
    expect((await ctx.db.query('SELECT * FROM jobs')).rows).toHaveLength(1);
  });
  it('deduplicates cross-source jobs while retaining alternate links and remote flag', async () => {
    await upsertJobs(ctx.db, [{ ...normalized, remote: false }]);
    const [job] = await upsertJobs(ctx.db, [
      {
        ...normalized,
        source: 'lever',
        sourceJobId: 'different',
        url: 'https://example.com/lever',
        postedAt: new Date('2026-01-01'),
      },
    ]);
    expect((await ctx.db.query('SELECT * FROM jobs')).rows).toHaveLength(1);
    expect(job.remote).toBe(true);
    expect(job.alt_sources).toContainEqual({
      source: 'lever',
      url: 'https://example.com/lever',
    });
    expect(job.posted_at?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('keeps earliest publication time on re-ingestion', async () => {
    await upsertJobs(ctx.db, [
      { ...normalized, postedAt: new Date('2026-01-01') },
    ]);
    const [job] = await upsertJobs(ctx.db, [
      { ...normalized, postedAt: new Date('2026-09-01') },
    ]);
    expect(job.posted_at?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('chooses the preferred canonical source within a batch', async () => {
    const [job] = await upsertJobs(ctx.db, [
      normalized,
      { ...normalized, source: 'greenhouse', sourceJobId: 'abc' },
    ]);
    expect(job.source).toBe('greenhouse');
  });
  it('deduplicates concurrent refreshes', async () => {
    await Promise.all([
      upsertJobs(ctx.db, [normalized]),
      upsertJobs(ctx.db, [
        { ...normalized, source: 'lever', sourceJobId: 'xyz' },
      ]),
    ]);
    expect((await ctx.db.query('SELECT * FROM jobs')).rows).toHaveLength(1);
  });
  it('updates same source identity after title changes without resetting status', async () => {
    const [job] = await upsertJobs(ctx.db, [normalized]);
    await updateStatus(ctx.db, 'user_a', job.id, 'Reviewing');
    await upsertJobs(ctx.db, [
      { ...normalized, title: 'Staff Backend Engineer' },
    ]);
    expect((await ctx.db.query('SELECT * FROM jobs')).rows).toHaveLength(1);
    expect(
      (await getJob(ctx.db, 'user_a', job.id, defaultProfile()))?.status,
    ).toBe('Reviewing');
  });
  it('rejects unsafe application links and handles invalid dates', async () => {
    expect(
      await upsertJobs(ctx.db, [{ ...normalized, url: 'javascript:alert(1)' }]),
    ).toHaveLength(0);
    const [job] = await upsertJobs(ctx.db, [
      { ...normalized, postedAt: new Date('invalid') },
    ]);
    expect(job.posted_at).toBeNull();
  });
  it('never overwrites another user profile', async () => {
    const p = { ...defaultProfile(), companies: ['Other'] };
    await saveProfile(ctx.db, 'user_a', p);
    const { rows } = await ctx.db.query<{
      id: string;
      profile: { companies: string[] };
    }>('SELECT id,profile FROM app_users ORDER BY id');
    expect(rows[0].profile.companies).toEqual(['Other']);
    expect(rows[1].profile.companies).toEqual([]);
  });
  it('shows skipped jobs when explicitly requested, only for that user', async () => {
    const [job] = await upsertJobs(ctx.db, [normalized]);
    await updateStatus(ctx.db, 'user_a', job.id, 'Skipped');
    expect(
      (
        await listJobs(
          ctx.db,
          'user_a',
          defaultProfile(),
          querySchema.parse({}),
        )
      ).total,
    ).toBe(0);
    expect(
      (
        await listJobs(
          ctx.db,
          'user_b',
          defaultProfile(),
          querySchema.parse({}),
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await listJobs(
          ctx.db,
          'user_a',
          defaultProfile(),
          querySchema.parse({ status: 'Skipped' }),
        )
      ).total,
    ).toBe(1);
  });
  it('searches case-insensitively, treats wildcards literally, and paginates', async () => {
    await upsertJobs(ctx.db, [
      normalized,
      { ...normalized, sourceJobId: '2', title: 'Staff Backend Engineer' },
    ]);
    expect(
      (
        await listJobs(
          ctx.db,
          'user_a',
          defaultProfile(),
          querySchema.parse({ search: 'ACME', limit: '1' }),
        )
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await listJobs(
          ctx.db,
          'user_a',
          defaultProfile(),
          querySchema.parse({ search: '%' }),
        )
      ).total,
    ).toBe(0);
  });
  it('requires valid pagination', () => {
    expect(querySchema.safeParse({ page: -1 }).success).toBe(false);
    expect(querySchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
  it('reports missing jobs without inserting private state', async () => {
    expect(await updateStatus(ctx.db, 'user_a', 999, 'Applied')).toBe(false);
    expect(await getJob(ctx.db, 'user_a', 999, defaultProfile())).toBeNull();
  });
  it('atomically prevents overlapping ingestion and rate limit races', async () => {
    let calls = 0;
    const adapter = {
      name: 'test',
      fetchJobs: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 40));
        return [normalized];
      },
    };
    const results = await Promise.all([
      runBatch(ctx.db, 'remoteok', adapter),
      runBatch(ctx.db, 'remoteok', adapter),
    ]);
    expect(calls).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual([
      'complete',
      'skipped',
    ]);
    expect(
      await Promise.all([
        allowRequest(ctx.db, 'test', 60),
        allowRequest(ctx.db, 'test', 60),
      ]),
    ).toContain(false);
  });
  it('records failed ingestion and releases its lease', async () => {
    expect(
      (
        await runBatch(ctx.db, 'remoteok', {
          name: 'test',
          fetchJobs: async () => {
            throw Error('secret');
          },
        })
      ).status,
    ).toBe('failed');
    const {
      rows: [row],
    } = await ctx.db.query<{ last_error: string; lease_token: null }>(
      'SELECT * FROM ingestion_state',
    );
    expect(row.lease_token).toBeNull();
    expect(row.last_error).not.toContain('secret');
  });
  it('preserves user scores independently', async () => {
    const [job] = await upsertJobs(ctx.db, [normalized]);
    const a = defaultProfile(),
      b = { ...defaultProfile(), roleFamilies: ['Frontend'], stack: [] };
    expect(
      (await getJob(ctx.db, 'user_a', job.id, a))?.fit_score,
    ).toBeGreaterThan(
      (await getJob(ctx.db, 'user_b', job.id, b))?.fit_score ?? 0,
    );
  });
});
it('handles two versions of the same source ID in one feed batch', async () => {
  const saved = await upsertJobs(ctx.db, [
    normalized,
    { ...normalized, title: 'Staff Backend Engineer' },
  ]);
  expect(saved).toHaveLength(1);
  expect(saved[0].title).toBe('Staff Backend Engineer');
});
