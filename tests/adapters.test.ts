import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';
import { GreenhouseAdapter } from '../lib/adapters/greenhouse.adapter';
import { AshbyAdapter } from '../lib/adapters/ashby.adapter';
import { passesTitleFilter } from '../lib/adapters/title-filter';
import { sourceBatches, sourceIntervalSeconds } from '../lib/ingestion/sources';
import config from '../vercel.json';
afterEach(() => vi.restoreAllMocks());
describe('migration adapter contracts', () => {
  it('does not label a Greenhouse update as a new publication', () => {
    const job = new GreenhouseAdapter().normalize(
      {
        id: 1,
        title: 'Engineer',
        absolute_url: 'https://example.com',
        updated_at: new Date().toISOString(),
      },
      'acme',
      'Acme',
    );
    expect(job?.postedAt).toBeUndefined();
  });
  it('preserves Ashby publication dates', () => {
    const date = '2026-09-16T03:00:00Z';
    const job = new AshbyAdapter().normalize(
      {
        id: '1',
        title: 'Engineer',
        jobUrl: 'https://example.com',
        publishedAt: date,
      },
      'acme',
      'Acme',
    );
    expect(job?.postedAt?.toISOString()).toBe('2026-09-16T03:00:00.000Z');
  });
  it('does not discard other users non-engineering roles', () => {
    vi.stubEnv('TITLE_ALLOWLIST_ENABLED', 'true');
    expect(passesTitleFilter('Accountant')).toBe(true);
    vi.unstubAllEnvs();
  });
  it('bounds company-board requests in one server action', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { jobs: [] } });
    await new AshbyAdapter(0, 3).fetchJobs();
    expect(get).toHaveBeenCalledTimes(3);
  });
  it('records source failures rather than treating them as empty success', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(Error('sensitive URL'));
    const adapter = new AshbyAdapter(0, 1);
    expect(await adapter.fetchJobs()).toEqual([]);
    expect(adapter.failures).toBe(1);
  });
  it('schedules every source batch exactly once and polls delayed feeds conservatively', () => {
    const sources = config.crons
      .filter((c) => c.path.startsWith('/api/cron/ingest'))
      .map((c) =>
        new URL(c.path, 'https://example.com').searchParams.get('source'),
      );
    expect(sources.sort()).toEqual([...sourceBatches].sort());
    expect(sourceIntervalSeconds('remotive')).toBe(21600);
    expect(
      config.crons.find((c) => c.path === '/api/cron/notifications')?.schedule,
    ).toBe('5 0 * * *');
  });
});
