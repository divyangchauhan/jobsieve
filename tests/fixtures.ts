import type { NormalizedJob } from '../lib/ingestion/normalized-job.interface';
import type { StoredJob } from '../lib/jobs';
import type { AppUser } from '../lib/users';
import { defaultProfile } from '../lib/profile/schema';
import { defaultAlerts } from '../lib/alerts/schema';
export const normalized: NormalizedJob = {
  source: 'ashby',
  sourceJobId: 'acme:123',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  url: 'https://example.com/jobs/123',
  tags: ['typescript'],
  remote: true,
  description: 'Build backend services in TypeScript.',
};
export function fixtureJob(
  overrides: Partial<StoredJob & { discovery_eligible: boolean }> = {},
): StoredJob & { discovery_eligible: boolean } {
  return {
    id: 1,
    dedup_key: 'ashby:acme:123',
    content_key: 'acme:seniorbackend',
    source: 'ashby',
    source_job_id: 'acme:123',
    title: normalized.title,
    company: normalized.company,
    url: normalized.url,
    tags: [...normalized.tags],
    remote: true,
    description: normalized.description!,
    posted_at: new Date(Date.now() - 3600000),
    first_seen_at: new Date(),
    last_seen_at: new Date(),
    salary: null,
    alt_sources: [],
    status: 'New',
    discovery_eligible: true,
    ...overrides,
  };
}
export function fixtureUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'user_a',
    email: 'test@example.com',
    profile: defaultProfile(),
    alert_settings: {
      ...defaultAlerts(),
      enabled: true,
      channels: ['push'],
      enabledAt: new Date(Date.now() - 7200000).toISOString(),
    },
    created_at: new Date(),
    ...overrides,
  };
}
