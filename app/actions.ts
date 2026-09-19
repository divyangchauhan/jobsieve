'use server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { allowRequest, runBatch } from '@/lib/ingestion/run';
import { sourceBatches } from '@/lib/ingestion/sources';
import { enqueueAlerts } from '@/lib/alerts/queue';
export async function ingestionBatches() {
  await requireUser();
  return sourceBatches;
}
export async function ingestSource(source: string) {
  const user = await requireUser();
  if (!sourceBatches.includes(source)) throw new Error('Unknown source');
  if (!(await allowRequest(db(), `ingest:${user.id}:${source}`, 60)))
    return { source, status: 'skipped' as const, count: 0 };
  return runBatch(db(), source);
}
export async function finishIngestion() {
  const user = await requireUser();
  if (await allowRequest(db(), `alerts:${user.id}`, 60))
    await enqueueAlerts(db(), new Date(), user.id);
  return { ok: true };
}
