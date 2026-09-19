import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET)
    return Response.json({ error: 'Webhook not configured' }, { status: 503 });
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }
  if (event.type === 'user.deleted' && event.data.id)
    await db().query('DELETE FROM app_users WHERE id=$1', [event.data.id]);
  if (event.type === 'user.updated') {
    const user = event.data;
    const email =
      user.email_addresses.find(
        (e) =>
          e.id === user.primary_email_address_id &&
          e.verification?.status === 'verified',
      )?.email_address ?? null;
    await db().query('UPDATE app_users SET email=$2 WHERE id=$1', [
      user.id,
      email,
    ]);
  }
  return Response.json({ ok: true });
}
