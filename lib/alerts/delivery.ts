import webpush from 'web-push';
import type { Database } from '../db/types';
import type { AppUser } from '../users';
import type { StoredJob } from '../jobs';
import { jobSelection } from '../job-selection';
import { decrypt } from './secrets';
import { validWebhook, validPushEndpoint, type Channel } from './schema';
import { claimDelivery, finishDelivery } from './queue';
import { defaultAlerts } from './schema';
export type NotificationJob = Pick<
  StoredJob,
  'id' | 'title' | 'company' | 'url' | 'posted_at' | 'first_seen_at'
>;
function textFor(job: NotificationJob) {
  return `${job.title} at ${job.company}\n${job.posted_at ? 'Posted' : 'First discovered'} ${new Date(job.posted_at ?? job.first_seen_at).toISOString()}\n${job.url}`;
}
async function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}`);
}
export async function sendNotification(
  db: Database,
  channel: Channel,
  user: AppUser,
  job: NotificationJob,
  id: number,
) {
  const text = textFor(job);
  if (channel === 'email') {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const identity = await (await clerkClient()).users.getUser(user.id);
    user = {
      ...user,
      email:
        identity.emailAddresses.find(
          (e) =>
            e.id === identity.primaryEmailAddressId &&
            e.verification?.status === 'verified',
        )?.emailAddress ?? null,
    };
    if (
      !user.email ||
      !process.env.RESEND_API_KEY ||
      !process.env.ALERT_EMAIL_FROM
    )
      throw new Error('Email is not configured');
    return post(
      'https://api.resend.com/emails',
      {
        from: process.env.ALERT_EMAIL_FROM,
        to: [user.email],
        subject: `New match: ${job.title} at ${job.company}`.slice(0, 200),
        text,
      },
      {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Idempotency-Key': `jobsieve-alert-${id}`,
      },
    );
  }
  if (channel === 'discord' || channel === 'slack') {
    const encrypted =
      channel === 'discord'
        ? user.alert_settings.discordWebhook
        : user.alert_settings.slackWebhook;
    if (!encrypted) throw new Error('Webhook is not configured');
    const url = decrypt(encrypted);
    if (!validWebhook(channel, url))
      throw new Error('Invalid webhook destination');
    return post(
      url,
      channel === 'discord'
        ? { content: text.slice(0, 1900), allowed_mentions: { parse: [] } }
        : {
            text: text.slice(0, 3000),
            unfurl_links: false,
            unfurl_media: false,
            blocks: [
              {
                type: 'section',
                text: { type: 'plain_text', text: text.slice(0, 2900) },
              },
            ],
          },
    );
  }
  const { rows } = await db.query<{
    id: number;
    endpoint: string;
    subscription: webpush.PushSubscription;
  }>(
    'SELECT id,endpoint,subscription FROM push_subscriptions WHERE user_id=$1',
    [user.id],
  );
  if (!rows.length) throw new Error('No subscribed device');
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error('Push is not configured');
  const results = await Promise.allSettled(
    rows.map(async (sub) => {
      if (!validPushEndpoint(sub.endpoint))
        throw new Error('Invalid push destination');
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            userId: user.id,
            title: `${job.title} · ${job.company}`,
            body: job.posted_at
              ? 'A recently posted job matches your settings.'
              : 'A newly discovered job matches your settings. Posting time is unknown.',
            url: `/jobs/${job.id}`,
            tag: `job-${job.id}`,
          }),
          {
            TTL: Math.max(
              0,
              Math.floor(
                (user.alert_settings.maxAgeHours * 3600000 -
                  (Date.now() -
                    new Date(job.posted_at ?? job.first_seen_at).getTime())) /
                  1000,
              ),
            ),
            timeout: 10000,
            vapidDetails: {
              subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
              publicKey,
              privateKey,
            },
          },
        );
        return true;
      } catch (error) {
        if (
          error instanceof webpush.WebPushError &&
          [404, 410].includes(error.statusCode)
        ) {
          await db.query(
            'DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2',
            [sub.id, user.id],
          );
          return false;
        }
        throw error;
      }
    }),
  );
  if (results.some((r) => r.status === 'rejected'))
    throw new Error('One or more push deliveries failed');
  if (!results.some((r) => r.status === 'fulfilled' && r.value))
    throw new Error('No active subscribed device');
}
export async function dispatchNotifications(
  db: Database,
  send = sendNotification,
  limit = 200,
  clock = Date.now,
) {
  const deadline = clock() + 120000;
  let sent = 0,
    failed = 0,
    canceled = 0;
  for (let i = 0; i < Math.min(limit, 200) && clock() < deadline; i++) {
    const delivery = await claimDelivery(db);
    if (!delivery) break;
    const {
      rows: [user],
    } = await db.query<AppUser>('SELECT * FROM app_users WHERE id=$1', [
      delivery.user_id,
    ]);
    const job = user
      ? await eligibleNotificationJob(
          db,
          user,
          delivery.job_id,
          delivery.channel,
        )
      : undefined;
    if (!user || !job) {
      await finishDelivery(db, delivery, undefined, true);
      canceled++;
      continue;
    }
    try {
      await send(db, delivery.channel, user, job, delivery.id);
      await finishDelivery(db, delivery);
      sent++;
    } catch {
      await finishDelivery(
        db,
        delivery,
        'Delivery failed; check destination and provider configuration',
      );
      failed++;
    }
  }
  return { sent, failed, canceled };
}

// Recheck the current profile and status in Postgres. Delivery only needs
// the notification text, so descriptions never leave the database here.
async function eligibleNotificationJob(
  db: Database,
  user: AppUser,
  jobId: number,
  channel: Channel,
  now = new Date(),
): Promise<NotificationJob | undefined> {
  const settings = { ...defaultAlerts(), ...user.alert_settings };
  if (
    !settings.enabled ||
    !settings.enabledAt ||
    !settings.channels.includes(channel)
  )
    return undefined;
  const s = jobSelection(user.profile, user.id, now);
  const publication = settings.includeDiscovered
    ? 'COALESCE(j.posted_at,CASE WHEN j.discovery_eligible THEN j.first_seen_at END)'
    : 'j.posted_at';
  s.where.push(
    `j.id=${s.param(jobId)}`,
    `j.first_seen_at>=${s.param(new Date(settings.enabledAt))}`,
    `${publication}>=${s.param(new Date(now.getTime() - settings.maxAgeHours * 3600000))}`,
    `${publication}<=${s.param(now)}`,
    `${s.status} NOT IN ('Applied','Skipped')`,
    s.roleMatch(),
    `${s.score}>=${s.param(user.profile.minFitScore ?? 0)}`,
  );
  const {
    rows: [job],
  } = await db.query<NotificationJob>(
    `SELECT j.id,j.title,j.company,j.url,j.posted_at,j.first_seen_at
     FROM jobs j ${s.join} WHERE ${s.where.join(' AND ')}`,
    s.values,
  );
  return job;
}
