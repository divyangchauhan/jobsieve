import { z } from 'zod';
import { requireUser, HttpError } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getJob,
  listJobs,
  querySchema,
  statusSchema,
  updateStatus,
} from '@/lib/jobs';
import { saveProfile } from '@/lib/users';
import { buildProfileOptions } from '@/lib/profile/profile-options';
import { publicAlerts, saveAlerts } from '@/lib/alerts/settings';
import { subscriptionSchema } from '@/lib/alerts/schema';
import { handleRequest } from '@/lib/http';
export const dynamic = 'force-dynamic';
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handleRequest(async () => {
    const origin = request.headers.get('origin');
    if (
      request.method !== 'GET' &&
      origin &&
      origin !== new URL(request.url).origin
    )
      throw new HttpError(403, 'Cross-origin changes are not allowed');
    const user = await requireUser();
    const database = db();
    const path = (await context.params).path.join('/');
    const method = request.method;
    if (path === 'jobs' && method === 'GET')
      return listJobs(
        database,
        user.id,
        user.profile,
        querySchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
    if (/^jobs\/\d+$/.test(path)) {
      const id = z.coerce.number().int().positive().parse(path.split('/')[1]);
      if (method === 'PATCH') {
        const { status } = z
          .object({ status: statusSchema })
          .parse(await request.json());
        if (!(await updateStatus(database, user.id, id, status)))
          throw new HttpError(404, 'Job not found');
      } else if (method !== 'GET')
        throw new HttpError(405, 'Method not allowed');
      const job = await getJob(database, user.id, id, user.profile);
      if (!job) throw new HttpError(404, 'Job not found');
      return job;
    }
    if (path === 'profile/options' && method === 'GET')
      return buildProfileOptions();
    if (path === 'profile' && method === 'GET') return user.profile;
    if (path === 'profile' && method === 'PUT')
      return saveProfile(database, user.id, await request.json());
    if (path === 'alerts' && method === 'GET') {
      const { rows: deliveries } = await database.query(
        `SELECT n.id,n.channel,n.status,n.last_error,n.created_at,n.sent_at,j.title,j.company FROM notification_outbox n JOIN jobs j ON j.id=n.job_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 30`,
        [user.id],
      );
      return {
        settings: publicAlerts(user.alert_settings),
        email: user.email,
        capabilities: {
          email: !!process.env.RESEND_API_KEY && !!process.env.ALERT_EMAIL_FROM,
          push:
            !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
            !!process.env.VAPID_PRIVATE_KEY,
          webhooks: !!process.env.NOTIFICATION_ENCRYPTION_KEY,
        },
        deliveries,
      };
    }
    if (path === 'alerts' && method === 'PUT') {
      try {
        return await saveAlerts(database, user, await request.json());
      } catch (error) {
        if (error instanceof z.ZodError) throw error;
        throw new HttpError(
          400,
          error instanceof Error ? error.message : 'Invalid alert settings',
        );
      }
    }
    if (path === 'push' && method === 'POST') {
      const sub = subscriptionSchema.parse(await request.json());
      // An endpoint represents a browser, so an account switch must transfer ownership.
      await database.query(
        `INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription`,
        [user.id, sub.endpoint, JSON.stringify(sub)],
      );
      return { ok: true };
    }
    if (path === 'push' && method === 'DELETE') {
      const { endpoint } = z
        .object({ endpoint: z.string().max(2048) })
        .parse(await request.json());
      await database.query(
        'DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
        [user.id, endpoint],
      );
      return { ok: true };
    }
    if (path === 'ingestion' && method === 'GET') {
      const { rows } = await database.query(
        'SELECT source,last_success_at,last_error FROM ingestion_state ORDER BY source',
      );
      return rows;
    }
    throw new HttpError(404, 'Not found');
  });
}
export {
  route as GET,
  route as POST,
  route as PUT,
  route as PATCH,
  route as DELETE,
};
