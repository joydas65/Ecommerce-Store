import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
const mode = process.env.E2E_MODE === 'live' ? 'live' : 'demo';
const htmlReporter = ['html', { open: 'never', outputFolder: `playwright-report/${mode}` }];

export default defineConfig({
  testDir: './e2e',
  testMatch: mode === 'live' ? 'foundation.spec.js' : 'demo.spec.js',
  outputDir: `test-results/${mode}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], htmlReporter]
    : [['list'], htmlReporter],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    },
  }],
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_COMMERCE_MODE: mode,
      NEXT_PUBLIC_COMMERCE_PUBLIC_KEY: '',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
    },
  },
});
