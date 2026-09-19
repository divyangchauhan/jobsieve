import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { testDatabase } from './database';
import { normalized } from './fixtures';
import { upsertJobs } from '../lib/ingestion/upsert';
import { jobSelection } from '../lib/job-selection';
import {
  matchesProfile,
  matchesAlertRole,
  score,
  listJobs,
  getJob,
  querySchema,
  type StoredJob,
} from '../lib/jobs';
import { defaultProfile, type Profile } from '../lib/profile/schema';
import { ROLE_FAMILIES, SENIORITIES } from '../lib/scoring/taxonomy';
import { ensureUser } from '../lib/users';
import { enqueueAlerts } from '../lib/alerts/queue';
import { dispatchNotifications } from '../lib/alerts/delivery';
import { defaultAlerts } from '../lib/alerts/schema';
import type { Database } from '../lib/db/types';
let ctx: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  ctx = await testDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  await ensureUser(ctx.db, 'user_a', null);
});
const titles = [
  'Senior Backend Engineer',
  'Frontend developer',
  'SRE / Platform engineer',
  'Full-stack developer',
  'Junior data engineer',
  'Staff engineering manager',
  'Designer',
  'C++ and Node.js developer',
  'Senior [engineer] (R&D)',
  'Sales manager',
  'Go backend developer',
  'Senior front',
  'Back-end sr. engineer',
];
const descriptions = [
  'Build APIs in TypeScript. Remote work, worldwide.',
  'US only. On-site position using Node.js.',
  'Hybrid role in India with PostgreSQL and Kubernetes.',
  'We go to market in Europe. Developers use C# and C++.',
  'Backend engineering with Python and SQL. 100% remote.',
  'end developer and a senior role.',
];
const profiles: Profile[] = [
  defaultProfile(),
  {
    ...defaultProfile(),
    roleFamilies: [],
    seniorities: [],
    stack: [],
    locationTypes: [],
    excludeTerms: [],
    regionEligibility: [],
  },
  ...Object.keys(ROLE_FAMILIES).map((role) => ({
    ...defaultProfile(),
    roleFamilies: [role],
    locationTypes: [],
  })),
  ...Object.keys(SENIORITIES).map((seniority) => ({
    ...defaultProfile(),
    seniorities: [seniority],
    locationTypes: [],
  })),
  {
    ...defaultProfile(),
    roleFamilies: [],
    stack: ['C++', 'C#', 'Node.js', 'go', 'r', '[engineer]', 'sr.', 'back-end'],
    locationTypes: ['hybrid', 'on-site'],
  },
  {
    ...defaultProfile(),
    roleFamilies: [],
    locationTypes: [],
    companyKeywords: ['AI', 'acme'],
    jobKeywords: ['python', 'node.js'],
  },
  {
    ...defaultProfile(),
    roleFamilies: [],
    locationTypes: [],
    companies: ['acme'],
    regionEligibility: ['us-only'],
    freshnessDays: 1,
  },
  {
    ...defaultProfile(),
    excludeTerms: ['[engineer]', 'sales', 'sr.'],
    locationTypes: [],
    stack: ['C++', '\\', '^.*$', 'a|b'],
  },
];
describe('SQL matching parity and database transfer', () => {
  it.each(profiles.map((profile, i) => ({ profile, name: `profile ${i}` })))(
    'matches existing JavaScript semantics for $name',
    async ({ profile }) => {
      await upsertJobs(
        ctx.db,
        titles.map((title, i) => ({
          ...normalized,
          title,
          company: i % 2 ? 'Acme' : 'Other',
          sourceJobId: String(i),
          description: descriptions[i % descriptions.length],
          tags: i % 2 ? ['node.js', 'C++'] : ['go', 'typescript'],
          remote: i % 3 === 0,
        })),
      );
      const now = new Date();
      const original = (
        await ctx.db.query<StoredJob>("SELECT *, 'New' AS status FROM jobs")
      ).rows;
      const s = jobSelection(profile, 'user_a', now);
      const role = s.roleMatch();
      const result = await ctx.db.query<{
        id: number;
        fit_score: number;
        matches: boolean;
        role_match: boolean;
      }>(
        `SELECT j.id,${s.score} AS fit_score,(${s.where.join(' AND ') || 'TRUE'}) AS matches,(${role}) AS role_match FROM jobs j ${s.join}`,
        s.values,
      );
      for (const row of result.rows) {
        const job = original.find((j) => j.id === row.id)!;
        expect(row.fit_score, job.title).toBe(score(job, profile));
        expect(row.matches, job.title).toBe(matchesProfile(job, profile, now));
        expect(row.role_match, job.title).toBe(matchesAlertRole(job, profile));
      }
    },
  );
  it('transfers only IDs during ingestion and only the requested page during listing', async () => {
    let returnedBytes = 0;
    const measured: Database = {
      async query<T>(sql: string, values?: unknown[]) {
        const result = await ctx.db.query<T>(sql, values);
        returnedBytes += Buffer.byteLength(JSON.stringify(result.rows));
        return result;
      },
    };
    const jobs = Array.from({ length: 30 }, (_, i) => ({
      ...normalized,
      title: `Senior Backend Engineer ${i}`,
      sourceJobId: String(i),
      description: 'TypeScript backend services. '.repeat(4000),
    }));
    const saved = await upsertJobs(measured, jobs, false, 'ids');
    expect(saved).toHaveLength(30);
    expect(returnedBytes).toBeLessThan(1000);
    returnedBytes = 0;
    const page = await listJobs(
      measured,
      'user_a',
      defaultProfile(),
      querySchema.parse({ limit: 2, page: 2 }),
    );
    expect(page.total).toBe(30);
    expect(page.data).toHaveLength(2);
    expect(returnedBytes).toBeLessThan(5000);
    for (const job of page.data) {
      expect(job).not.toHaveProperty('description');
      expect(job).not.toHaveProperty('dedup_key');
      expect(job).not.toHaveProperty('content_key');
      expect(job).not.toHaveProperty('alt_sources');
    }
    const detail = await getJob(
      ctx.db,
      'user_a',
      page.data[0].id,
      defaultProfile(),
    );
    expect(detail?.description).toBe(jobs[0].description);
    expect(detail?.fit_score).toBe(page.data[0].fit_score);
    const beyond = await listJobs(
      measured,
      'user_a',
      defaultProfile(),
      querySchema.parse({ limit: 2, page: 100 }),
    );
    expect(beyond.total).toBe(30);
    expect(beyond.data).toEqual([]);
    returnedBytes = 0;
    await ctx.db.query('UPDATE app_users SET alert_settings=$1', [
      JSON.stringify({
        enabled: true,
        channels: ['push'],
        enabledAt: new Date(Date.now() - 60000).toISOString(),
        maxAgeHours: 3,
        includeDiscovered: false,
      }),
    ]);
    await ctx.db.query('UPDATE jobs SET posted_at=now()');
    expect(await enqueueAlerts(measured)).toBe(30);
    expect(returnedBytes).toBeLessThan(5000);
    expect(await enqueueAlerts(measured)).toBe(0);
    returnedBytes = 0;
    const delivered = await dispatchNotifications(
      measured,
      async (_db, _channel, _user, job) => {
        expect(job).not.toHaveProperty('description');
        expect(job).not.toHaveProperty('tags');
        expect(job.title).toContain('Senior Backend Engineer');
      },
      1,
    );
    expect(delivered.sent).toBe(1);
    expect(returnedBytes).toBeLessThan(5000);
  });
  it('does not read job descriptions when nobody enabled alerts', async () => {
    const statements: string[] = [];
    const measured: Database = {
      async query<T>(sql: string, values?: unknown[]) {
        statements.push(sql);
        return ctx.db.query<T>(sql, values);
      },
    };
    expect(await enqueueAlerts(measured)).toBe(0);
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toContain('FROM jobs');
  });
  it.each([
    {
      name: 'removed channel',
      mutation: `UPDATE app_users SET alert_settings=jsonb_set(alert_settings,'{channels}','["email"]')`,
      sent: 0,
    },
    {
      name: 'future posting',
      mutation: `UPDATE jobs SET posted_at=now()+interval '1 hour'`,
      sent: 0,
    },
    {
      name: 're-enabled alerts after discovery',
      mutation: `UPDATE app_users SET alert_settings=jsonb_set(alert_settings,'{enabledAt}',to_jsonb((now()+interval '1 minute')::text))`,
      sent: 0,
    },
    {
      name: 'unknown posting without discovery consent',
      mutation: `UPDATE jobs SET posted_at=NULL,discovery_eligible=true`,
      sent: 0,
    },
    {
      name: 'first import excluded from discovery alerts',
      mutation: `UPDATE jobs SET posted_at=NULL,discovery_eligible=false`,
      sent: 0,
      includeDiscovered: true,
    },
    {
      name: 'eligible discovery alert',
      mutation: `UPDATE jobs SET posted_at=NULL,discovery_eligible=true`,
      sent: 1,
      includeDiscovered: true,
    },
    {
      name: 'role mismatch',
      mutation: `UPDATE jobs SET title='Accountant',description='Corporate accounting',tags='[]'`,
      sent: 0,
    },
    {
      name: 'raised score threshold',
      mutation: `UPDATE app_users SET profile=jsonb_set(profile,'{minFitScore}','100')`,
      sent: 0,
    },
    {
      name: 'another account applying',
      mutation: `INSERT INTO user_jobs(user_id,job_id,status) VALUES('user_b',1,'Applied')`,
      sent: 1,
    },
  ])(
    'rechecks $name in SQL before sending',
    async ({ mutation, sent, includeDiscovered }) => {
      await ensureUser(ctx.db, 'user_b', null);
      await ctx.db.query('UPDATE app_users SET alert_settings=$1 WHERE id=$2', [
        JSON.stringify({
          ...defaultAlerts(),
          enabled: true,
          channels: ['push'],
          enabledAt: new Date(Date.now() - 60000).toISOString(),
          includeDiscovered: includeDiscovered ?? false,
        }),
        'user_a',
      ]);
      await upsertJobs(ctx.db, [
        { ...normalized, postedAt: new Date(Date.now() - 60000) },
      ]);
      await ctx.db.query(
        `INSERT INTO notification_outbox(user_id,job_id,channel) VALUES('user_a',1,'push')`,
      );
      await ctx.db.query(mutation);
      let sends = 0;
      const result = await dispatchNotifications(ctx.db, async () => {
        sends++;
      });
      expect(sends).toBe(sent);
      expect(result).toEqual({ sent, failed: 0, canceled: 1 - sent });
    },
  );
});
