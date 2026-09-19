import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), true);
if (
  !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') ||
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)
  throw new Error(
    'Live auth tests require Clerk development keys in .env.local. Production keys are deliberately rejected.',
  );
const database =
  process.env.TEST_DATABASE_URL ??
  'postgresql://jobsieve_test:jobsieve_test@localhost:5432/jobsieve_test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'live.spec.ts',
  outputDir: 'test-results/live',
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4318',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm db:migrate && pnpm dev --port 4318',
    env: { DATABASE_URL: database },
    url: 'http://localhost:4318/sign-in',
    timeout: 120000,
  },
});
