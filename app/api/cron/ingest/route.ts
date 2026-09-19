import { db } from '@/lib/db';
import { runBatch } from '@/lib/ingestion/run';
import { sourceBatches } from '@/lib/ingestion/sources';
import { validCron } from '@/lib/cron-auth';
import { handleRequest } from '@/lib/http';
export const maxDuration = 240;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!validCron(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const source = new URL(request.url).searchParams.get('source') ?? '';
  if (!sourceBatches.includes(source))
    return Response.json({ error: 'Unknown source' }, { status: 400 });
  return handleRequest(async () => {
    const result = await runBatch(db(), source);
    return Response.json(result, {
      status: result.status === 'failed' ? 502 : 200,
    });
  });
}
