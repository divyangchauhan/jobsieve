import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
async function pushFor(
  activeUser: string | null,
  targetUser: string,
  url = '/jobs/1',
) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const show = vi.fn();
  let pending: Promise<unknown> | undefined;
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        handlers[type] = fn;
      },
      registration: { showNotification: show },
      location: { origin: 'https://jobsieve.example' },
    },
    caches: {
      open: async () => ({
        match: async () => ({ json: async () => activeUser }),
      }),
    },
    URL,
    Response,
  });
  handlers.push({
    data: { json: () => ({ userId: targetUser, title: 'A job', url }) },
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
  return show;
}
describe('push account isolation', () => {
  it('shows notifications for the active account', async () =>
    expect(await pushFor('user_a', 'user_a')).toHaveBeenCalledTimes(1));
  it('suppresses notifications after sign-out', async () =>
    expect(await pushFor(null, 'user_a')).not.toHaveBeenCalled());
  it('suppresses another account notifications on a shared browser', async () =>
    expect(await pushFor('user_b', 'user_a')).not.toHaveBeenCalled());
  it('restricts notification click URLs to local job details', async () => {
    const show = await pushFor('user_a', 'user_a', 'https://evil.example');
    expect(show.mock.calls[0][1].data.url).toBe('/');
  });
});
