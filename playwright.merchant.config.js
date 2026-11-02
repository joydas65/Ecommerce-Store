import { defineConfig, devices } from '@playwright/test';

// This suite creates local database sessions. It must never target a deployed
// site or use a production database, token, or identity-provider credential.
if (process.env.E2E_BASE_URL || process.env.E2E_DEPLOYED || process.env.VERCEL) {
  throw new Error('Merchant integration tests only run against the local disposable database.');
}

const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['merchant.spec.js', 'merchant-payment-checks.spec.js'],
  outputDir: 'test-results/merchant',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 8_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [process.env.CI ? ['github'] : ['list'], ['html', { open: 'never', outputFolder: 'playwright-report/merchant' }]],
  use: {
    baseURL,
    // Authenticated request traces can contain cookies. Keep only screenshots
    // of the synthetic order UI, never cookie files or storageState artifacts.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) } }],
  webServer: [{
    command: 'node scripts/test/merchant-recheck-service.mjs',
    url: 'http://127.0.0.1:4101/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      MERCHANT_TEST_FIXTURES: 'true',
      ORDERS_API_SECRET: process.env.ORDERS_API_SECRET || 'local-orders-test-secret-at-least-32-characters',
      MERCHANT_AUTH_ENABLED: 'true',
      BETTER_AUTH_URL: baseURL,
      MERCHANT_ALLOW_LOCAL_AUTH: 'true',
      GITHUB_CLIENT_ID: 'fixture-client',
      GITHUB_CLIENT_SECRET: 'fixture-client-secret-at-least-20',
      MERCHANT_GITHUB_IDS: '123456789',
    },
  }, {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_CATALOG_PROVIDER: 'seeded',
      NEXT_PUBLIC_PAYMENT_PROVIDER: 'simulated',
      NEXT_PUBLIC_ORDER_STORAGE: 'remote',
      NEXT_PUBLIC_COMMERCE_MODE: 'demo',
      NEXT_PUBLIC_DEMO_ORDER_STORAGE: 'remote',
      NEXT_PUBLIC_COMMERCE_PUBLIC_KEY: '',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
      ORDERS_API_URL: 'http://127.0.0.1:4101',
      ORDERS_ALLOW_LOCAL_API: 'true',
      ORDERS_API_SECRET: process.env.ORDERS_API_SECRET || 'local-orders-test-secret-at-least-32-characters',
      MERCHANT_AUTH_ENABLED: 'true',
      MERCHANT_AUTH_ORIGIN: baseURL,
    },
  }],
});
