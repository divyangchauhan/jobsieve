import { z } from 'zod';
export const channels = ['email', 'discord', 'slack', 'push'] as const;
export type Channel = (typeof channels)[number];
export const alertSchema = z
  .object({
    enabled: z.boolean(),
    channels: z
      .array(z.enum(channels))
      .max(4)
      .transform((v) => [...new Set(v)]),
    maxAgeHours: z.number().int().min(1).max(24),
    includeDiscovered: z.boolean(),
    discordWebhook: z.string().max(1000).optional(),
    slackWebhook: z.string().max(1000).optional(),
  })
  .refine(
    (a) => !a.enabled || a.channels.length > 0,
    'Choose at least one notification channel',
  );
export interface SavedAlerts {
  enabled: boolean;
  channels: Channel[];
  maxAgeHours: number;
  includeDiscovered: boolean;
  enabledAt: string | null;
  discordWebhook?: string;
  slackWebhook?: string;
}
export function defaultAlerts(): SavedAlerts {
  return {
    enabled: false,
    channels: [],
    maxAgeHours: 3,
    includeDiscovered: false,
    enabledAt: null,
  };
}
export function validWebhook(
  channel: 'slack' | 'discord',
  value: string,
): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.search &&
      !u.hash &&
      (channel === 'slack'
        ? u.hostname === 'hooks.slack.com' &&
          /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(
            u.pathname,
          )
        : ['discord.com', 'discordapp.com'].includes(u.hostname) &&
          /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname))
    );
  } catch {
    return false;
  }
}
export function validPushEndpoint(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.port &&
      !u.username &&
      !u.password &&
      (u.hostname === 'fcm.googleapis.com' ||
        u.hostname === 'updates.push.services.mozilla.com' ||
        u.hostname.endsWith('.push.apple.com') ||
        u.hostname === 'web.push.apple.com' ||
        u.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
export const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine(validPushEndpoint, 'Unsupported push service'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_=-]+$/)
      .min(40)
      .max(200),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_=-]+$/)
      .min(16)
      .max(100),
  }),
});
