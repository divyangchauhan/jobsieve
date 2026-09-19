import { randomUUID } from 'node:crypto';
import type { Database } from '../db/types';
import type { AppUser } from '../users';
import { jobSelection } from '../job-selection';
import type { Channel } from './schema';
export interface Delivery {
  id: number;
  user_id: string;
  job_id: number;
  channel: Channel;
  attempts: number;
  lease_token: string;
}
export async function enqueueAlerts(
  db: Database,
  now = new Date(),
  userId?: string,
) {
  let cursor = '';
  let queued = 0;
  while (true) {
    const { rows: users } = await db.query<AppUser>(
      `SELECT id,profile,alert_settings FROM app_users WHERE (alert_settings->>'enabled')::boolean=true AND id>$1 ${userId ? 'AND id=$2' : ''} ORDER BY id LIMIT 100`,
      userId ? [cursor, userId] : [cursor],
    );
    if (!users.length) break;
    for (const user of users) {
      const settings = user.alert_settings;
      if (!settings.enabledAt || !settings.channels.length) continue;
      const s = jobSelection(user.profile, user.id, now);
      const cutoff = s.param(
        new Date(now.getTime() - settings.maxAgeHours * 3600000),
      );
      const until = s.param(now);
      const publication = settings.includeDiscovered
        ? 'COALESCE(j.posted_at,CASE WHEN j.discovery_eligible THEN j.first_seen_at END)'
        : 'j.posted_at';
      s.where.push(
        `j.first_seen_at>=${s.param(new Date(Math.max(new Date(settings.enabledAt).getTime(), now.getTime() - 86400000)))}`,
        `${publication}>=${cutoff} AND ${publication}<=${until}`,
        `${s.status} NOT IN ('Applied','Skipped')`,
        s.roleMatch(),
        `${s.score}>=${s.param(user.profile.minFitScore ?? 0)}`,
      );
      const channels = s.param(settings.channels);
      const { rows } = await db.query<{ count: number }>(
        `WITH queued AS (
          INSERT INTO notification_outbox(user_id,job_id,channel)
          SELECT $1,j.id,c.channel FROM jobs j ${s.join}
          CROSS JOIN unnest(${channels}::text[]) AS c(channel)
          WHERE ${s.where.join(' AND ')}
          AND NOT EXISTS (SELECT 1 FROM notification_outbox n WHERE n.user_id=$1 AND n.job_id=j.id AND n.channel=c.channel)
          ON CONFLICT(user_id,job_id,channel) DO NOTHING RETURNING 1
        ) SELECT count(*)::integer AS count FROM queued`,
        s.values,
      );
      queued += rows[0].count;
    }
    cursor = users[users.length - 1].id;
  }
  return queued;
}
export async function claimDelivery(
  db: Database,
): Promise<Delivery | undefined> {
  const {
    rows: [row],
  } = await db.query<Delivery>(
    `WITH exhausted AS (
      UPDATE notification_outbox SET status='failed',lease_token=NULL,lease_until=NULL,last_error='Delivery attempt limit reached'
      WHERE attempts>=5 AND (status='pending' OR (status='sending' AND lease_until<now()))
    )
    UPDATE notification_outbox SET status='sending',lease_until=now()+interval '90 seconds',lease_token=$1,attempts=attempts+1 WHERE id=(SELECT id FROM notification_outbox WHERE attempts<5 AND ((status='pending' AND available_at<=now()) OR (status='sending' AND lease_until<now())) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,user_id,job_id,channel,attempts,lease_token`,
    [randomUUID()],
  );
  return row;
}
export async function finishDelivery(
  db: Database,
  delivery: Delivery,
  error?: string,
  canceled = false,
) {
  const failed = delivery.attempts >= 5;
  await db.query(
    `UPDATE notification_outbox SET status=$3,last_error=$4,lease_until=NULL,lease_token=NULL,sent_at=CASE WHEN $3='sent' THEN now() ELSE sent_at END,available_at=now()+($5 * interval '1 second') WHERE id=$1 AND lease_token=$2`,
    [
      delivery.id,
      delivery.lease_token,
      canceled ? 'canceled' : error ? (failed ? 'failed' : 'pending') : 'sent',
      error ?? null,
      Math.min(3600, 30 * 2 ** delivery.attempts),
    ],
  );
}
