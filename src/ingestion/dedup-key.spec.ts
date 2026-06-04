import { createHash } from 'crypto';
import { dedupKey } from './dedup-key.js';
import { NormalizedJob } from './normalized-job.interface.js';

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: 'test-source',
    title: 'Engineer',
    company: 'Acme',
    url: 'https://example.com/jobs/1',
    tags: [],
    remote: false,
    ...overrides,
  };
}

describe('dedupKey', () => {
  it('uses source:sourceJobId when sourceJobId is present', () => {
    const job = makeJob({ source: 'remoteok', sourceJobId: 'abc123' });
    expect(dedupKey(job)).toBe('remoteok:abc123');
  });

  it('falls back to SHA-1 of normalized URL when sourceJobId is absent', () => {
    const job = makeJob({ url: 'https://example.com/jobs/42' });
    expect(dedupKey(job)).toBe(sha1('example.com/jobs/42'));
  });

  it('strips trailing slash from URL path', () => {
    const withSlash = makeJob({ url: 'https://example.com/jobs/42/' });
    const withoutSlash = makeJob({ url: 'https://example.com/jobs/42' });
    expect(dedupKey(withSlash)).toBe(dedupKey(withoutSlash));
  });

  it('strips query string from URL', () => {
    const withQuery = makeJob({ url: 'https://example.com/jobs/42?ref=board' });
    const clean = makeJob({ url: 'https://example.com/jobs/42' });
    expect(dedupKey(withQuery)).toBe(dedupKey(clean));
  });

  it('strips hash fragment from URL', () => {
    const withHash = makeJob({ url: 'https://example.com/jobs/42#details' });
    const clean = makeJob({ url: 'https://example.com/jobs/42' });
    expect(dedupKey(withHash)).toBe(dedupKey(clean));
  });

  it('normalizes uppercase host to lowercase', () => {
    const upperHost = makeJob({ url: 'https://EXAMPLE.COM/jobs/42' });
    const lowerHost = makeJob({ url: 'https://example.com/jobs/42' });
    expect(dedupKey(upperHost)).toBe(dedupKey(lowerHost));
  });

  it('throws when URL is missing and sourceJobId is absent', () => {
    const job = makeJob({ url: 'not-a-valid-url' });
    expect(() => dedupKey(job)).toThrow();
  });
});
