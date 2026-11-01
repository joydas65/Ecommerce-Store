import { defineConfig, devices } from '@playwright/test';

const mode = ['live', 'stripe'].includes(process.env.E2E_MODE) ? process.env.E2E_MODE : 'demo';
const persistentOrders = mode === 'demo' && process.env.E2E_ORDER_STORAGE === 'remote';
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
  if (!['demo', 'stripe'].includes(mode)) throw new Error('Deployed-site checks only run against simulation or Stripe test checkout.');
}
const baseURL = deployedURL ? new URL(deployedURL).origin : 'http://127.0.0.1:3100';
const reportName = deployedURL ? 'deployed' : mode === 'stripe' ? 'stripe-contract' : persistentOrders ? 'persistent' : mode;
const htmlReporter = ['html', { open: 'never', outputFolder: `playwright-report/${reportName}` }];
const testMatch = mode === 'live' ? ['foundation.spec.js'] : mode === 'stripe'
  ? [deployedURL ? 'stripe-deployment.spec.js' : 'stripe-contract.spec.js']
  : ['demo.spec.js', 'deployment.spec.js', 'catalog.spec.js', 'product.spec.js', 'discovery.spec.js', ...(persistentOrders ? ['persistent-orders.spec.js'] : [])];
if (deployedURL) testMatch.push('merchant-deployment.spec.js');

export default defineConfig({
  testDir: './e2e',
  testMatch,
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
      NEXT_PUBLIC_COMMERCE_MODE: mode === 'live' ? 'live' : 'demo',
      NEXT_PUBLIC_DEMO_ORDER_STORAGE: persistentOrders ? 'remote' : 'local',
      NEXT_PUBLIC_CATALOG_PROVIDER: mode === 'live' ? 'commercejs' : 'seeded',
      NEXT_PUBLIC_PAYMENT_PROVIDER: mode === 'demo' ? 'simulated' : 'stripe',
      NEXT_PUBLIC_ORDER_STORAGE: mode === 'live' ? 'commercejs' : mode === 'stripe' || persistentOrders ? 'remote' : 'local',
      ...(persistentOrders ? {
        ORDERS_API_URL: process.env.ORDERS_API_URL || 'http://127.0.0.1:4100',
        ORDERS_ALLOW_LOCAL_API: 'true',
        ORDERS_API_SECRET: process.env.ORDERS_API_SECRET || 'local-orders-test-secret-at-least-32-characters',
      } : {}),
      // The local Stripe suite intercepts the BFF contract in the browser. An
      // unhandled request must fail closed, never contact a real payment API.
      ...(mode === 'stripe' ? { ORDERS_API_URL: '', ORDERS_API_SECRET: '', ORDERS_ALLOW_LOCAL_API: '' } : {}),
      NEXT_PUBLIC_COMMERCE_PUBLIC_KEY: '',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
    },
  },
});
