import { test, expect, type Page } from '@playwright/test';
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from '@clerk/testing/playwright';
import { Pool } from 'pg';
const identities: { id: string; email: string }[] = [];
let jobId: number;
function testPool() {
  return new Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      'postgresql://jobsieve_test:jobsieve_test@localhost:5432/jobsieve_test',
  });
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByText('Sign out', { exact: true }).click();
  await expect(page).toHaveURL(/sign-in/);
}
async function clerkRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(`Clerk test setup failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
test.beforeAll(async () => {
  await clerkSetup();
  for (let i = 0; i < 2; i++) {
    const email = `jobsieve-${Date.now()}-${i}+clerk_test@example.com`;
    const user = await clerkRequest('/users', 'POST', {
      email_address: [email],
      skip_password_requirement: true,
    });
    identities.push({ id: user.id, email });
  }
  const pool = testPool();
  try {
    const key = `live-test-${Date.now()}`;
    const result = await pool.query(
      "INSERT INTO jobs(dedup_key,content_key,source,title,company,url) VALUES($1,$1,'test','Backend Engineer','Browser test','https://example.com/job') RETURNING id",
      [key],
    );
    jobId = result.rows[0].id;
  } finally {
    await pool.end();
  }
});
test.afterAll(async () => {
  const pool = testPool();
  try {
    for (const user of identities) {
      await clerkRequest(`/users/${user.id}`, 'DELETE');
      await pool.query('DELETE FROM app_users WHERE id=$1', [user.id]);
    }
    if (jobId) await pool.query('DELETE FROM jobs WHERE id=$1', [jobId]);
  } finally {
    await pool.end();
  }
});
test('real Clerk sessions isolate profiles, job statuses and signed-out access', async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({ page, emailAddress: identities[0].email });
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Relevance profile' }),
  ).toBeVisible();
  await page
    .getByLabel('Companies (exact names; any match)')
    .fill('First user only');
  await page.getByLabel('Companies (exact names; any match)').press('Enter');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved — jobs re-ranked')).toBeVisible();
  const statusChange = await page.request.patch(`/api/jobs/${jobId}`, {
    data: { status: 'Applied', userId: identities[1].id },
  });
  expect(statusChange.ok()).toBe(true);
  expect((await statusChange.json()).status).toBe('Applied');
  await signOut(page);
  await page.goto('/sign-in');
  await clerk.signIn({ page, emailAddress: identities[1].email });
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Relevance profile' }),
  ).toBeVisible();
  await expect(page.getByText('first user only', { exact: true })).toHaveCount(
    0,
  );
  const otherUserJob = await page.request.get(`/api/jobs/${jobId}`);
  expect(otherUserJob.ok()).toBe(true);
  expect((await otherUserJob.json()).status).toBe('New');
  await signOut(page);
  await page.goto('/settings');
  await expect(page).toHaveURL(/sign-in/);
});
