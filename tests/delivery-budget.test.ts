import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase } from './database';
import { normalized } from './fixtures';
import { ensureUser } from '../lib/users';
import { defaultAlerts } from '../lib/alerts/schema';
import { upsertJobs } from '../lib/ingestion/upsert';
import { dispatchNotifications } from '../lib/alerts/delivery';

let ctx: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  ctx = await testDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  await ensureUser(ctx.db, 'a', null);
  await ctx.db.query('UPDATE app_users SET alert_settings=$1', [
    JSON.stringify({
      ...defaultAlerts(),
      enabled: true,
      channels: ['push'],
      enabledAt: new Date(Date.now() - 60000).toISOString(),
    }),
  ]);
});
async function queue(count: number) {
  await upsertJobs(
    ctx.db,
    Array.from({ length: count }, (_, i) => ({
      ...normalized,
      title: `Backend Engineer ${i}`,
      sourceJobId: String(i),
      postedAt: new Date(Date.now() - 60000),
    })),
  );
  await ctx.db.query(
    `INSERT INTO notification_outbox(user_id,job_id,channel) SELECT 'a',id,'push' FROM jobs`,
  );
}
it('finishes the current delivery but claims nothing further after the time budget', async () => {
  await queue(3);
  let time = 0;
  let sends = 0;
  const result = await dispatchNotifications(
    ctx.db,
    async () => {
      sends++;
      time = 120000;
    },
    200,
    () => time,
  );
  expect(result).toEqual({ sent: 1, failed: 0, canceled: 0 });
  expect(sends).toBe(1);
  const { rows } = await ctx.db.query<{ status: string; attempts: number }>(
    `SELECT status,attempts FROM notification_outbox ORDER BY id`,
  );
  expect(rows).toEqual([
    { status: 'sent', attempts: 1 },
    { status: 'pending', attempts: 0 },
    { status: 'pending', attempts: 0 },
  ]);
});
it('does not acquire a lease when its budget has already elapsed', async () => {
  await queue(1);
  let checks = 0;
  const result = await dispatchNotifications(
    ctx.db,
    async () => {
      throw new Error('must not send');
    },
    200,
    () => (checks++ === 0 ? 0 : 120000),
  );
  expect(result).toEqual({ sent: 0, failed: 0, canceled: 0 });
  expect(
    (
      await ctx.db.query<{ attempts: number }>(
        'SELECT attempts FROM notification_outbox',
      )
    ).rows[0].attempts,
  ).toBe(0);
});
it('caps a requested delivery batch at 200 even with a larger caller limit', async () => {
  await queue(201);
  const result = await dispatchNotifications(
    ctx.db,
    async () => {},
    1000,
    () => 0,
  );
  expect(result).toEqual({ sent: 200, failed: 0, canceled: 0 });
  expect(
    (
      await ctx.db.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM notification_outbox WHERE status='pending' AND attempts=0`,
      )
    ).rows[0].count,
  ).toBe(1);
});
