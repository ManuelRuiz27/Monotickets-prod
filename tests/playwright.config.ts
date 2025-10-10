import { defineConfig, devices } from '@playwright/test';
import { getFrontendBaseURL, isCIEnvironment } from './fixtures/env';

const baseURL = getFrontendBaseURL();

export default defineConfig({
  testDir: '.',
  timeout: 5 * 60 * 1000,
  retries: isCIEnvironment() ? 1 : 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: '../reports/junit/playwright-[project].xml' }],
  ],
  outputDir: 'artifacts',
  preserveOutput: 'always',
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
