import axios from 'axios';

import {
  YCombinatorAdapter,
  algoliaRetryDelayMs,
  normalizeYcJob,
  parseYcCompanyPage,
  type YcJobPosting,
} from './ycombinator.adapter.js';

describe('YCombinatorAdapter helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses the structured Inertia payload from a company page', () => {
    const payload = {
      props: {
        company: { name: 'Finto' },
        jobPostings: [
          {
            id: 80796,
            title: 'Product Engineer',
            url: '/companies/finto-de/jobs/product-engineer',
          },
        ],
      },
    };
    const encoded = JSON.stringify(payload)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');

    expect(parseYcCompanyPage(`<div data-page="${encoded}"></div>`)).toEqual({
      company: 'Finto',
      jobs: payload.props.jobPostings,
    });
  });

  it('normalizes a YC job posting', () => {
    const posting: YcJobPosting = {
      id: 80796,
      title: 'Senior Backend Engineer',
      url: '/companies/finto-de/jobs/backend-engineer',
      location: 'Remote / Munich, Germany',
      type: 'Full-time',
      prettyRole: 'Engineering',
      salaryRange: '€80K - €130K EUR',
      skills: ['Node.js', 'TypeScript'],
      companyName: 'Finto',
      companyOneLiner: 'AI accounting for enterprise teams',
    };

    expect(normalizeYcJob(posting, 'Fallback')).toEqual({
      source: 'ycombinator',
      sourceJobId: '80796',
      title: 'Senior Backend Engineer',
      company: 'Finto',
      url: 'https://www.ycombinator.com/companies/finto-de/jobs/backend-engineer',
      tags: [
        'Engineering',
        'Full-time',
        'Node.js',
        'TypeScript',
        'Remote / Munich, Germany',
      ],
      remote: true,
      salary: '€80K - €130K EUR',
      description: 'AI accounting for enterprise teams',
    });
  });

  it('rejects incomplete job postings', () => {
    expect(normalizeYcJob({ title: 'Engineer' }, 'Acme')).toBeNull();
    expect(
      normalizeYcJob(
        { id: 1, title: 'AI Engineer', url: 'http://[invalid' },
        'Acme',
      ),
    ).toBeNull();
  });

  it('bounds Algolia backoff while honoring Retry-After', () => {
    expect(algoliaRetryDelayMs('3', 1_000, 0)).toBe(3_000);
    expect(algoliaRetryDelayMs('60', 1_000, 0)).toBe(30_000);
    expect(algoliaRetryDelayMs(undefined, 1_000, 0)).toBe(1_000);
  });

  it('queries configured slugs directly instead of relying on a capped page', async () => {
    jest.spyOn(axios, 'get').mockResolvedValueOnce({
      data: '<script>window.AlgoliaOpts = {"app":"demo","key":"public"};</script>',
    });
    const post = jest.spyOn(axios, 'post').mockResolvedValueOnce({
      data: {
        results: [
          { hits: [{ slug: 'outside-global-cap' }] },
          { hits: [{ slug: 'different-company' }] },
        ],
      },
    });
    const adapter = new YCombinatorAdapter() as unknown as {
      configured: ReadonlySet<string>;
      fetchHiringSlugs(): Promise<string[]>;
    };
    adapter.configured = new Set(['outside-global-cap', 'not-hiring']);

    await expect(adapter.fetchHiringSlugs()).resolves.toEqual([
      'outside-global-cap',
    ]);
    const body = post.mock.calls[0]?.[1] as {
      requests: ReadonlyArray<{ params: string }>;
    };
    expect(
      body.requests.map((request) =>
        new URLSearchParams(request.params).get('query'),
      ),
    ).toEqual(['outside-global-cap', 'not-hiring']);
  });

  it('preserves successful YC batches when a later batch fails', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') callback();
      return 0 as unknown as NodeJS.Timeout;
    });
    jest.spyOn(axios, 'get').mockResolvedValueOnce({
      data: '<script>window.AlgoliaOpts = {"app":"demo","key":"public"};</script>',
    });
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({
        data: {
          results: [
            { hits: [{ slug: 'company-0' }] },
            ...Array.from({ length: 49 }, () => ({ hits: [] })),
          ],
        },
      })
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockRejectedValueOnce(new Error('rate limited'));
    const adapter = new YCombinatorAdapter() as unknown as {
      configured: ReadonlySet<string>;
      fetchHiringSlugs(): Promise<string[]>;
    };
    adapter.configured = new Set(
      Array.from({ length: 151 }, (_, index) => `company-${index}`),
    );

    await expect(adapter.fetchHiringSlugs()).resolves.toEqual(['company-0']);
    expect(post).toHaveBeenCalledTimes(5);
  });
});
