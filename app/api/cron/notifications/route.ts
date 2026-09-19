import { db } from '@/lib/db';
import { validCron } from '@/lib/cron-auth';
import { enqueueAlerts } from '@/lib/alerts/queue';
import { dispatchNotifications } from '@/lib/alerts/delivery';
import { handleRequest } from '@/lib/http';
import { allowRequest } from '@/lib/ingestion/run';
export const maxDuration = 240;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!validCron(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return handleRequest(async () => {
    // Global across all instances; outlasts this route's maximum lifetime.
    if (!(await allowRequest(db(), 'cron:notifications', 300)))
      return { skipped: true };
    const queued = await enqueueAlerts(db());
    const result = await dispatchNotifications(db());
    return { queued, ...result };
  });
}
