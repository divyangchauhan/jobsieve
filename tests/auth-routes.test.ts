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
const state = vi.hoisted(() => ({
  id: null as string | null,
  emailVerified: true,
  db: undefined as unknown,
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: state.id }),
  currentUser: async () =>
    state.id
      ? {
          id: state.id,
          primaryEmailAddressId: 'email_1',
          emailAddresses: [
            {
              id: 'email_1',
              emailAddress: `${state.id}@example.com`,
              verification: {
                status: state.emailVerified ? 'verified' : 'unverified',
              },
            },
          ],
        }
      : null,
}));
vi.mock('../lib/db', () => ({ db: () => state.db }));
import { GET, PATCH, PUT, POST, DELETE } from '../app/api/[...path]/route';
import { ingestSource, ingestionBatches } from '../app/actions';
let ctx: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  ctx = await testDatabase();
  state.db = ctx.db;
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  state.id = 'user_a';
  state.emailVerified = true;
});
const request = (path: string, method = 'GET', body?: unknown) =>
  new Request(`https://jobsieve.example/api/${path}`, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
const params = (path: string) => ({
  params: Promise.resolve({ path: path.split('?')[0].split('/') }),
});
describe('authenticated request boundaries', () => {
  it('rejects cross-origin changes even with an authenticated session', async () => {
    const profile = await (
      await GET(request('profile'), params('profile'))
    ).json();
    const foreign = request('profile', 'PUT', {
      ...profile,
      companies: ['Injected'],
    });
    foreign.headers.set('Origin', 'https://other.jobsieve.example');
    expect((await PUT(foreign, params('profile'))).status).toBe(403);
    expect(
      (await (await GET(request('profile'), params('profile'))).json())
        .companies,
    ).toEqual([]);
    const sameOrigin = request('profile', 'PUT', {
      ...profile,
      companies: ['Allowed'],
    });
    sameOrigin.headers.set('Origin', 'https://jobsieve.example');
    expect((await PUT(sameOrigin, params('profile'))).status).toBe(200);
  });
  it('denies unauthenticated reads and writes and Server Actions', async () => {
    state.id = null;
    expect((await GET(request('jobs'), params('jobs'))).status).toBe(401);
    expect(
      (await PUT(request('profile', 'PUT', {}), params('profile'))).status,
    ).toBe(401);
    await expect(ingestionBatches()).rejects.toThrow('Sign in');
    await expect(ingestSource('remoteok')).rejects.toThrow('Sign in');
    expect((await ctx.db.query('SELECT * FROM app_users')).rows).toHaveLength(
      0,
    );
  });
  it('isolates profiles and ignores caller-supplied user identity', async () => {
    const response = await GET(request('profile'), params('profile'));
    const profile = await response.json();
    await PUT(
      request('profile', 'PUT', {
        ...profile,
        companies: ['Acme'],
        userId: 'user_b',
      }),
      params('profile'),
    );
    state.id = 'user_b';
    const b = await (await GET(request('profile'), params('profile'))).json();
    expect(b.companies).toEqual([]);
    state.id = 'user_a';
    expect(
      (await (await GET(request('profile'), params('profile'))).json())
        .companies,
    ).toEqual(['Acme']);
  });
  it('isolates application status even when a forged userId is submitted', async () => {
    const [job] = await upsertJobs(ctx.db, [normalized]);
    await PATCH(
      request(`jobs/${job.id}`, 'PATCH', {
        status: 'Applied',
        userId: 'user_b',
      }),
      params(`jobs/${job.id}`),
    );
    state.id = 'user_b';
    expect(
      (
        await (
          await GET(request(`jobs/${job.id}`), params(`jobs/${job.id}`))
        ).json()
      ).status,
    ).toBe('New');
    state.id = 'user_a';
    expect(
      (
        await (
          await GET(request(`jobs/${job.id}`), params(`jobs/${job.id}`))
        ).json()
      ).status,
    ).toBe('Applied');
  });
  it('rejects invalid payloads and missing jobs', async () => {
    expect(
      (
        await PATCH(
          request('jobs/999', 'PATCH', { status: 'unknown' }),
          params('jobs/999'),
        )
      ).status,
    ).toBe(400);
    expect((await GET(request('jobs/999'), params('jobs/999'))).status).toBe(
      404,
    );
    expect((await GET(request('jobs?page=-1'), params('jobs'))).status).toBe(
      400,
    );
  });
  it('does not cache private responses', async () => {
    expect(
      (await GET(request('profile'), params('profile'))).headers.get(
        'cache-control',
      ),
    ).toBe('private, no-store');
  });
  it('does not save an unverified account email', async () => {
    state.emailVerified = false;
    await GET(request('profile'), params('profile'));
    expect(
      (await ctx.db.query<{ email: null }>('SELECT email FROM app_users'))
        .rows[0].email,
    ).toBeNull();
  });
  it('prevents deletion of another user push subscription', async () => {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'A'.repeat(80), auth: 'A'.repeat(22) },
    };
    expect(
      (await POST(request('push', 'POST', subscription), params('push')))
        .status,
    ).toBe(200);
    state.id = 'user_b';
    await DELETE(
      request('push', 'DELETE', { endpoint: subscription.endpoint }),
      params('push'),
    );
    expect(
      (await ctx.db.query('SELECT * FROM push_subscriptions')).rows,
    ).toHaveLength(1);
  });
  it('transfers device subscriptions only through explicit authenticated registration', async () => {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'A'.repeat(80), auth: 'A'.repeat(22) },
    };
    await POST(request('push', 'POST', subscription), params('push'));
    state.id = 'user_b';
    await POST(request('push', 'POST', subscription), params('push'));
    expect(
      (
        await ctx.db.query<{ user_id: string }>(
          'SELECT user_id FROM push_subscriptions',
        )
      ).rows,
    ).toEqual([{ user_id: 'user_b' }]);
  });
  it('rejects private network push endpoints', async () => {
    expect(
      (
        await POST(
          request('push', 'POST', {
            endpoint: 'https://localhost/internal',
            keys: { p256dh: 'A'.repeat(80), auth: 'A'.repeat(22) },
          }),
          params('push'),
        )
      ).status,
    ).toBe(400);
  });
});
