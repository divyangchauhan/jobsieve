import { afterEach, expect, it, vi } from 'vitest';
const driver = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => driver,
  neonConfig: {},
  Pool: vi.fn(),
}));
import { db } from '../lib/db';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('sets a database statement timeout in the same transaction as every query', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://test:test@example.neon.tech/test');
  driver.query.mockImplementation((text, values) => ({ text, values }));
  driver.transaction.mockResolvedValue([[], [{ id: 1 }]]);
  expect(await db().query('SELECT id FROM jobs WHERE id=$1', [1])).toEqual({
    rows: [{ id: 1 }],
  });
  expect(driver.transaction).toHaveBeenCalledWith(
    [
      { text: "SET LOCAL statement_timeout = '15s'", values: undefined },
      { text: 'SELECT id FROM jobs WHERE id=$1', values: [1] },
    ],
    { fetchOptions: { signal: expect.any(AbortSignal) } },
  );
});
