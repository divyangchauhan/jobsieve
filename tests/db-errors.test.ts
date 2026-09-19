import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { databaseError, DatabaseQuotaError } from '../lib/db/errors';
import { handleRequest } from '../lib/http';
describe('database quota failures', () => {
  it('preserves explicit cron response status and payload', async () => {
    const response = await handleRequest(async () =>
      Response.json({ status: 'failed', count: 2 }, { status: 502 }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: 'failed', count: 2 });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('returns a useful 503 without exposing provider details or credentials', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const original = new Error(
        'Server error (HTTP status 402): Your project has exceeded the data transfer quota. postgres://secret',
      );
      const mapped = databaseError(original);
      expect(mapped).toBeInstanceOf(DatabaseQuotaError);
      const response = await handleRequest(async () => {
        throw mapped;
      });
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body.code).toBe('DATABASE_QUOTA_EXCEEDED');
      expect(body.error).toContain('temporarily unavailable');
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(spy).toHaveBeenCalledWith('Database quota exhausted');
    } finally {
      spy.mockRestore();
    }
  });
  it('preserves unrelated database errors', () => {
    const error = new Error('duplicate key');
    expect(databaseError(error)).toBe(error);
  });
});
