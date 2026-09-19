import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results/ui',
  testDir: './tests/e2e',
  testMatch: 'ui.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4317', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --config tests/ui-harness/vite.config.mts',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: !process.env.CI,
  },
  workers: 2,
});
