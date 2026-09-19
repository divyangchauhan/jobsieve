import type { Database } from '../db/types';
import type { AppUser } from '../users';
import {
  alertSchema,
  defaultAlerts,
  validWebhook,
  type SavedAlerts,
} from './schema';
import { encrypt } from './secrets';
export function publicAlerts(settings: SavedAlerts) {
  const { discordWebhook, slackWebhook, ...rest } = {
    ...defaultAlerts(),
    ...settings,
  };
  return {
    ...rest,
    discordConfigured: !!discordWebhook,
    slackConfigured: !!slackWebhook,
  };
}
export async function saveAlerts(db: Database, user: AppUser, input: unknown) {
  const parsed = alertSchema.parse(input);
  const previous = { ...defaultAlerts(), ...user.alert_settings };
  const saved: SavedAlerts = {
    ...previous,
    ...parsed,
    enabledAt: parsed.enabled
      ? previous.enabled && previous.enabledAt
        ? previous.enabledAt
        : new Date().toISOString()
      : null,
  };
  for (const channel of ['discord', 'slack'] as const) {
    const field = channel === 'discord' ? 'discordWebhook' : 'slackWebhook';
    const value = parsed[field];
    if (value !== undefined) {
      if (value && !validWebhook(channel, value))
        throw new Error(`Enter a valid ${channel} webhook URL`);
      saved[field] = value ? encrypt(value) : undefined;
    }
    if (saved.enabled && saved.channels.includes(channel) && !saved[field])
      throw new Error(`Configure ${channel} before enabling it`);
  }
  if (
    saved.enabled &&
    saved.channels.includes('email') &&
    (!user.email ||
      !process.env.RESEND_API_KEY ||
      !process.env.ALERT_EMAIL_FROM)
  )
    throw new Error(
      'Email alerts need a verified account email and a configured sender',
    );
  if (saved.enabled && saved.channels.includes('push')) {
    if (
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY
    )
      throw new Error('Browser push is not configured');
    const { rows } = await db.query(
      'SELECT id FROM push_subscriptions WHERE user_id=$1',
      [user.id],
    );
    if (!rows.length)
      throw new Error('Enable notifications on this device first');
  }
  await db.query('UPDATE app_users SET alert_settings=$2 WHERE id=$1', [
    user.id,
    JSON.stringify(saved),
  ]);
  return publicAlerts(saved);
}
