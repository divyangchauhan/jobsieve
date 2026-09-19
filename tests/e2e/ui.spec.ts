import { test, expect } from '@playwright/test';
import { defaultProfile } from '../../lib/profile/schema';
import { buildProfileOptions } from '../../lib/profile/profile-options';
const job = {
  id: 1,
  dedup_key: 'a',
  source: 'ashby',
  source_job_id: 'a',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  url: 'https://example.com/job',
  posted_at: new Date().toISOString(),
  tags: ['typescript'],
  remote: true,
  salary: '$100k',
  description:
    '<p>Build APIs.</p><img src="bad" onerror="window.xss=true"><script>window.xss=true</script>',
  fit_score: 11,
  status: 'New',
  first_seen_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
};
const {
  description: _description,
  dedup_key: _dedupKey,
  source_job_id: _sourceJobId,
  ...jobSummary
} = job;
test.beforeEach(async ({ page }) => {
  let profile = defaultProfile();
  let status = 'New';
  let settings = {
    enabled: false,
    channels: [],
    maxAgeHours: 3,
    includeDiscovered: false,
    discordConfigured: false,
    slackConfigured: false,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let result: unknown = {};
    if (url.pathname === '/api/profile/options') result = buildProfileOptions();
    else if (url.pathname === '/api/profile') {
      if (request.method() === 'PUT') profile = request.postDataJSON();
      result = profile;
    } else if (url.pathname === '/api/jobs/1') {
      if (request.method() === 'PATCH') status = request.postDataJSON().status;
      result = { ...job, status };
    } else if (url.pathname === '/api/jobs')
      result = {
        data: [{ ...jobSummary, status }],
        total: ['search', 'status', 'remote', 'minFitScore'].some((key) =>
          url.searchParams.has(key),
        )
          ? 2
          : 1,
        page: 1,
        limit: 20,
      };
    else if (url.pathname === '/api/alerts') {
      if (request.method() === 'PUT')
        settings = { ...settings, ...request.postDataJSON() };
      result =
        request.method() === 'PUT'
          ? settings
          : {
              settings,
              email: 'test@example.com',
              capabilities: { email: true, push: false, webhooks: true },
              deliveries: [],
            };
    }
    await route.fulfill({ json: result });
  });
});
test('shows the service outage explanation instead of an Axios status code', async ({
  page,
}) => {
  const message =
    'Job data is temporarily unavailable. The site owner needs to restore database access.';
  await page.route('**/api/jobs?*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: message, code: 'DATABASE_QUOTA_EXCEEDED' },
    }),
  );
  await page.goto('/');
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Request failed with status code 503'),
  ).toHaveCount(0);
});
test('browses jobs, changes status, sanitizes descriptions and has no horizontal overflow', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Senior Backend Engineer' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Senior Backend Engineer' }).click();
  await expect(
    page.getByRole('heading', { name: 'Senior Backend Engineer' }),
  ).toBeVisible();
  await expect(page.locator('img[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'xss'))).toBeUndefined();
  await page.getByRole('button', { name: 'Applied', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Applied', exact: true }),
  ).toHaveClass(/ring-2/);
});
test('clears search, status, remote and score filters', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('1 job found')).toBeVisible();
  await page.getByPlaceholder('Search title or company…').fill('Acme');
  await expect(page.getByText('2 jobs found')).toBeVisible();
  await page.getByPlaceholder('Search title or company…').fill('');
  await expect(page.getByText('1 job found')).toBeVisible();
  await page.getByLabel('Application status').selectOption('Applied');
  await expect(page.getByText('2 jobs found')).toBeVisible();
  await page.getByLabel('Application status').selectOption('');
  await expect(page.getByText('1 job found')).toBeVisible();
  await page.getByLabel('Remote only').check();
  await expect(page.getByText('2 jobs found')).toBeVisible();
  await page.getByLabel('Remote only').uncheck();
  await expect(page.getByText('1 job found')).toBeVisible();
  await page.getByLabel('Min score').fill('10');
  await expect(page.getByText('2 jobs found')).toBeVisible();
  await page.getByLabel('Min score').fill('0');
  await expect(page.getByText('1 job found')).toBeVisible();
});
test('saves personal company and job keyword criteria', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Companies (exact names; any match)').fill('Acme');
  await page.getByLabel('Companies (exact names; any match)').press('Enter');
  await page
    .getByLabel('Job title / description keywords (any match)')
    .fill('TypeScript');
  await page
    .getByLabel('Job title / description keywords (any match)')
    .press('Enter');
  const saved = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().endsWith('/api/profile'),
  );
  await page.getByRole('button', { name: 'Save profile' }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    companies: ['acme'],
    jobKeywords: ['typescript'],
  });
  await expect(page.getByText('Profile saved — jobs re-ranked')).toBeVisible();
});
test('configures early-job alerts and reports successful save', async ({
  page,
}) => {
  await page.goto('/alerts');
  await page.getByLabel('Enable new-job alerts', { exact: true }).check();
  await page.getByLabel('Email', { exact: true }).check();
  await page.getByLabel('Notify within this many hours of posting').fill('2');
  const saved = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().endsWith('/api/alerts'),
  );
  await page.getByRole('button', { name: 'Save alerts' }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    enabled: true,
    channels: ['email'],
    maxAgeHours: 2,
  });
  await expect(page.getByText('Alert settings saved')).toBeVisible();
});
test('manual refresh uses the button and reports completion', async ({
  page,
}) => {
  let listRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/jobs') listRequests++;
  });
  await page.goto('/');
  await expect(page.getByText('1 job found')).toBeVisible();
  expect(listRequests).toBe(1);
  await page.getByRole('button', { name: 'Sync jobs' }).click();
  await expect(page.getByText('Refresh complete')).toBeVisible();
  await expect.poll(() => listRequests).toBe(2);
  await expect(page.getByRole('button', { name: 'Sync jobs' })).toBeEnabled();
  expect(listRequests).toBe(2);
});
