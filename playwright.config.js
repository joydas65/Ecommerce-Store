import { defineConfig, devices } from '@playwright/test';

const mode = process.env.E2E_MODE === 'live' ? 'live' : 'demo';
const deployedURL = process.env.E2E_BASE_URL?.trim();
if (process.env.E2E_DEPLOYED && !deployedURL) {
  throw new Error('E2E_BASE_URL is required for deployed-site checks.');
}
if (deployedURL) {
  let target;
  try { target = new URL(deployedURL); }
  catch { throw new Error('E2E_BASE_URL must be a valid HTTPS origin.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('E2E_BASE_URL must be an HTTPS origin without credentials, a path, or query parameters.');
  }
  if (mode !== 'demo') throw new Error('Deployed-site checks only run against the simulated demo.');
}
const baseURL = deployedURL ? new URL(deployedURL).origin : 'http://127.0.0.1:3100';
const reportName = deployedURL ? 'deployed' : mode;
const htmlReporter = ['html', { open: 'never', outputFolder: `playwright-report/${reportName}` }];

export default defineConfig({
  testDir: './e2e',
  testMatch: mode === 'live' ? 'foundation.spec.js' : ['demo.spec.js', 'deployment.spec.js', 'catalog.spec.js', 'product.spec.js'],
  outputDir: `test-results/${reportName}`,
  timeout: deployedURL ? 90_000 : 30_000,
  expect: { timeout: deployedURL ? 10_000 : 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI || deployedURL ? 2 : undefined,
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
  webServer: deployedURL ? undefined : {
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
