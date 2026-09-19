import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { testDatabase } from './database';
import { normalized } from './fixtures';
import { upsertJobs } from '../lib/ingestion/upsert';
import { ensureUser } from '../lib/users';
import {
  defaultAlerts,
  validWebhook,
  validPushEndpoint,
} from '../lib/alerts/schema';
import { publicAlerts, saveAlerts } from '../lib/alerts/settings';
import { encrypt, decrypt } from '../lib/alerts/secrets';
import {
  enqueueAlerts,
  claimDelivery,
  finishDelivery,
} from '../lib/alerts/queue';
import {
  dispatchNotifications,
  sendNotification,
} from '../lib/alerts/delivery';
import { updateStatus } from '../lib/jobs';
import { validCron } from '../lib/cron-auth';
import webpush from 'web-push';
let ctx: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  ctx = await testDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await ctx.reset();
  const user = await ensureUser(ctx.db, 'user_a', 'a@example.com');
  await ctx.db.query('UPDATE app_users SET alert_settings=$2 WHERE id=$1', [
    user.id,
    JSON.stringify({
      ...defaultAlerts(),
      enabled: true,
      channels: ['push'],
      enabledAt: new Date(Date.now() - 10000).toISOString(),
    }),
  ]);
  await upsertJobs(ctx.db, [
    { ...normalized, postedAt: new Date(Date.now() - 60000) },
  ]);
});
describe('durable alerts', () => {
  it('enqueues once per user/job/channel under concurrent scans', async () => {
    await Promise.all([enqueueAlerts(ctx.db), enqueueAlerts(ctx.db)]);
    expect(
      (await ctx.db.query('SELECT * FROM notification_outbox')).rows,
    ).toHaveLength(1);
  });
  it('keeps notification ownership isolated across users', async () => {
    await ensureUser(ctx.db, 'user_b', 'b@example.com');
    await enqueueAlerts(ctx.db);
    expect(
      (
        await ctx.db.query<{ user_id: string }>(
          'SELECT * FROM notification_outbox',
        )
      ).rows.map((r) => r.user_id),
    ).toEqual(['user_a']);
  });
  it('claims only one worker lease', async () => {
    await enqueueAlerts(ctx.db);
    const claims = await Promise.all([
      claimDelivery(ctx.db),
      claimDelivery(ctx.db),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('retries failed delivery without exposing provider credentials', async () => {
    await enqueueAlerts(ctx.db);
    const send = vi.fn().mockRejectedValue(Error('secret webhook URL'));
    expect(await dispatchNotifications(ctx.db, send)).toEqual({
      sent: 0,
      failed: 1,
      canceled: 0,
    });
    const {
      rows: [row],
    } = await ctx.db.query<{
      status: string;
      last_error: string;
      attempts: number;
    }>('SELECT * FROM notification_outbox');
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.last_error).not.toContain('secret');
  });
  it('marks successful delivery and does not send it again', async () => {
    await enqueueAlerts(ctx.db);
    const send = vi.fn().mockResolvedValue(undefined);
    await dispatchNotifications(ctx.db, send);
    await enqueueAlerts(ctx.db);
    await dispatchNotifications(ctx.db, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await ctx.db.query<{ status: string }>(
          'SELECT status FROM notification_outbox',
        )
      ).rows[0].status,
    ).toBe('sent');
  });
  it('cancels queued delivery after alerts are disabled', async () => {
    await enqueueAlerts(ctx.db);
    await ctx.db.query(
      "UPDATE app_users SET alert_settings=jsonb_set(alert_settings,'{enabled}','false')",
    );
    const send = vi.fn();
    expect((await dispatchNotifications(ctx.db, send)).canceled).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
  it('rechecks criteria before delivery', async () => {
    await enqueueAlerts(ctx.db);
    await ctx.db.query(
      `UPDATE app_users SET profile=jsonb_set(profile,'{companies}','["Other"]')`,
    );
    const send = vi.fn();
    expect((await dispatchNotifications(ctx.db, send)).canceled).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
  it('cancels queued jobs after applying', async () => {
    await enqueueAlerts(ctx.db);
    await updateStatus(ctx.db, 'user_a', 1, 'Applied');
    expect((await dispatchNotifications(ctx.db, vi.fn())).canceled).toBe(1);
  });
  it('cancels jobs that age beyond the chosen window during a retry', async () => {
    await enqueueAlerts(ctx.db);
    await ctx.db.query("UPDATE jobs SET posted_at=now()-interval '4 hours'");
    expect((await dispatchNotifications(ctx.db, vi.fn())).canceled).toBe(1);
  });
  it('recovers an expired lease and rejects stale-worker completion', async () => {
    await enqueueAlerts(ctx.db);
    const first = (await claimDelivery(ctx.db))!;
    await ctx.db.query(
      "UPDATE notification_outbox SET lease_until=now()-interval '1 minute'",
    );
    const second = (await claimDelivery(ctx.db))!;
    await finishDelivery(ctx.db, first);
    expect(
      (
        await ctx.db.query<{ status: string }>(
          'SELECT status FROM notification_outbox',
        )
      ).rows[0].status,
    ).toBe('sending');
    await finishDelivery(ctx.db, second);
    expect(
      (
        await ctx.db.query<{ status: string }>(
          'SELECT status FROM notification_outbox',
        )
      ).rows[0].status,
    ).toBe('sent');
  });
  it('stops retrying after five attempts', async () => {
    await enqueueAlerts(ctx.db);
    await ctx.db.query('UPDATE notification_outbox SET attempts=4');
    await dispatchNotifications(
      ctx.db,
      vi.fn().mockRejectedValue(Error('fail')),
    );
    expect(
      (
        await ctx.db.query<{ status: string }>(
          'SELECT status FROM notification_outbox',
        )
      ).rows[0].status,
    ).toBe('failed');
  });
});
describe('notification destinations and secrets', () => {
  async function pushFixture() {
    const keys = webpush.generateVAPIDKeys();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);
    vi.stubEnv('VAPID_SUBJECT', 'https://jobsieve.example');
    const user = await ensureUser(ctx.db, 'user_a', 'a@example.com');
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'test', auth: 'test' },
    };
    await ctx.db.query(
      'INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3)',
      [user.id, subscription.endpoint, JSON.stringify(subscription)],
    );
    const job = (
      await ctx.db.query<import('../lib/jobs').StoredJob>('SELECT * FROM jobs')
    ).rows[0];
    return { user, job, subscription };
  }
  it('sends push only to the owning user devices with bounded freshness and an internal link', async () => {
    const { user, job, subscription } = await pushFixture();
    await ensureUser(ctx.db, 'user_b', 'b@example.com');
    await ctx.db.query(
      'INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3)',
      [
        'user_b',
        'https://fcm.googleapis.com/fcm/send/other',
        JSON.stringify({
          ...subscription,
          endpoint: 'https://fcm.googleapis.com/fcm/send/other',
        }),
      ],
    );
    const send = vi
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    await sendNotification(ctx.db, 'push', user, job, 1);
    expect(send).toHaveBeenCalledTimes(1);
    const [destination, payload, options] = send.mock.calls[0];
    expect(destination.endpoint).toBe(subscription.endpoint);
    expect(JSON.parse(payload as string)).toMatchObject({
      userId: user.id,
      url: `/jobs/${job.id}`,
      tag: `job-${job.id}`,
    });
    expect(options?.TTL).toBeGreaterThan(0);
    expect(options?.TTL).toBeLessThanOrEqual(3 * 3600);
    expect(options?.timeout).toBe(10000);
  });
  it('removes expired push subscriptions without reporting a delivered alert', async () => {
    const { user, job, subscription } = await pushFixture();
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      new webpush.WebPushError('Gone', 410, {}, '', subscription.endpoint),
    );
    await expect(
      sendNotification(ctx.db, 'push', user, job, 1),
    ).rejects.toThrow('No active');
    expect(
      (await ctx.db.query('SELECT * FROM push_subscriptions')).rows,
    ).toHaveLength(0);
  });
  it('retains a device subscription after a transient provider error', async () => {
    const { user, job, subscription } = await pushFixture();
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      new webpush.WebPushError(
        'Unavailable',
        503,
        {},
        '',
        subscription.endpoint,
      ),
    );
    await expect(
      sendNotification(ctx.db, 'push', user, job, 1),
    ).rejects.toThrow('failed');
    expect(
      (await ctx.db.query('SELECT * FROM push_subscriptions')).rows,
    ).toHaveLength(1);
  });
  it.each([
    'https://evil.example/x',
    'http://hooks.slack.com/services/A/B/C',
    'https://hooks.slack.com.evil.example/services/A/B/C',
    'https://user:pass@hooks.slack.com/services/A/B/C',
    'https://hooks.slack.com:444/services/A/B/C',
    'https://hooks.slack.com/services/A/B/C?redirect=evil',
  ])('rejects unsafe webhook %s', (url) =>
    expect(validWebhook('slack', url)).toBe(false),
  );
  it('accepts only official webhook formats', () => {
    expect(
      validWebhook('slack', 'https://hooks.slack.com/services/A/B/C'),
    ).toBe(true);
    expect(
      validWebhook('discord', 'https://discord.com/api/webhooks/123/abc_def'),
    ).toBe(true);
    expect(validWebhook('discord', 'https://discord.com/api/users/123')).toBe(
      false,
    );
  });
  it.each([
    'https://localhost/x',
    'https://169.254.169.254/x',
    'https://fcm.googleapis.com.evil.com/x',
    'http://fcm.googleapis.com/x',
  ])('rejects unsafe push endpoint %s', (url) =>
    expect(validPushEndpoint(url)).toBe(false),
  );
  it('encrypts webhook tokens and detects tampering', () => {
    vi.stubEnv('NOTIFICATION_ENCRYPTION_KEY', 'ab'.repeat(32));
    const ciphertext = encrypt('secret-value');
    expect(ciphertext).not.toContain('secret-value');
    expect(decrypt(ciphertext)).toBe('secret-value');
    expect(() =>
      decrypt(ciphertext.replace(/^./, ciphertext[0] === 'A' ? 'B' : 'A')),
    ).toThrow();
  });
  it('never returns webhook secrets to clients', () =>
    expect(
      publicAlerts({ ...defaultAlerts(), discordWebhook: 'ciphertext' }),
    ).toEqual({
      ...defaultAlerts(),
      discordConfigured: true,
      slackConfigured: false,
    }));
  it('preserves encrypted webhook when saving other settings', async () => {
    vi.stubEnv('NOTIFICATION_ENCRYPTION_KEY', 'ab'.repeat(32));
    let user = await ensureUser(ctx.db, 'user_a', 'a@example.com');
    await saveAlerts(ctx.db, user, {
      enabled: true,
      channels: ['discord'],
      maxAgeHours: 2,
      includeDiscovered: false,
      discordWebhook: 'https://discord.com/api/webhooks/123/abc',
    });
    user = (
      await ctx.db.query<typeof user>('SELECT * FROM app_users WHERE id=$1', [
        'user_a',
      ])
    ).rows[0];
    const original = user.alert_settings.discordWebhook;
    await saveAlerts(ctx.db, user, {
      enabled: true,
      channels: ['discord'],
      maxAgeHours: 3,
      includeDiscovered: false,
    });
    expect(
      (
        await ctx.db.query<typeof user>('SELECT * FROM app_users WHERE id=$1', [
          'user_a',
        ])
      ).rows[0].alert_settings.discordWebhook,
    ).toBe(original);
  });
  it('requires sender configuration and verified email', async () => {
    const user = await ensureUser(ctx.db, 'user_a', null);
    await expect(
      saveAlerts(ctx.db, user, {
        enabled: true,
        channels: ['email'],
        maxAgeHours: 3,
        includeDiscovered: false,
      }),
    ).rejects.toThrow('verified');
  });
  it('rejects missing or mismatched cron credentials', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    expect(validCron(new Request('https://example.com'))).toBe(false);
    expect(
      validCron(
        new Request('https://example.com', {
          headers: { authorization: 'Bearer wrong' },
        }),
      ),
    ).toBe(false);
    expect(
      validCron(
        new Request('https://example.com', {
          headers: { authorization: 'Bearer test-secret' },
        }),
      ),
    ).toBe(true);
  });
  it('sends Slack as plain text and forbids redirects', async () => {
    vi.stubEnv('NOTIFICATION_ENCRYPTION_KEY', 'ab'.repeat(32));
    const user = await ensureUser(ctx.db, 'user_a', 'a@example.com');
    user.alert_settings.slackWebhook = encrypt(
      'https://hooks.slack.com/services/A/B/C',
    );
    const job = (
      await ctx.db.query<import('../lib/jobs').StoredJob>('SELECT * FROM jobs')
    ).rows[0];
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'));
    await sendNotification(ctx.db, 'slack', user, job, 1);
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body as string).blocks[0].text.type).toBe(
      'plain_text',
    );
  });
});
