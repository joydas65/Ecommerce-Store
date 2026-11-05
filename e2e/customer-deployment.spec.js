import { test as base, expect } from '@playwright/test';

// This public release gate never signs in, creates a customer, or visits Google.
// Real OAuth acceptance is verified separately on the canonical storefront.
const test = base.extend({
  verifiedCustomerDeployment: [async ({ page, context, baseURL }, provide) => {
    if (!process.env.E2E_DEPLOYED || !process.env.E2E_BASE_URL || !/^[\da-f]{40}$/i.test(process.env.E2E_EXPECTED_COMMIT_SHA || '')) {
      throw new Error('Customer release checks require a deployed origin and exact commit SHA.');
    }
    if (!['true', 'false'].includes(process.env.E2E_CUSTOMER_ENABLED)) {
      throw new Error('Set E2E_CUSTOMER_ENABLED explicitly for this deployment.');
    }
    const origin = new URL(baseURL).origin;
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) errors.push(message.text());
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
        external.push(url.origin + url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    const health = await page.request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(health.headers()['cache-control']).toContain('no-store');
    expect(await health.json()).toMatchObject({ status: 'ok', commit: process.env.E2E_EXPECTED_COMMIT_SHA });
    expect((await context.cookies()).filter((cookie) => /joys_(?:customer|merchant)/.test(cookie.name))).toHaveLength(0);
    await provide();
    expect(errors, 'Customer browser and hydration errors').toEqual([]);
    expect(external, 'The public customer gate must never contact an identity or payment provider').toEqual([]);
    expect((await context.cookies()).filter((cookie) => /joys_(?:customer|merchant)/.test(cookie.name))).toHaveLength(0);
  }, { auto: true }],
});

const enabled = process.env.E2E_CUSTOMER_ENABLED === 'true';
const missingOrder = 'order_00000000-0000-4000-8000-000000000000';

async function expectDenied(response, status) {
  expect(response.status()).toBe(status);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toEqual({ error: { code: expect.any(String), message: expect.any(String) } });
}

test('keeps account pages private and makes the configured Google sign-in discoverable', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Your purchases, in one place.', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  if (enabled) {
    await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Your account', exact: true })).toHaveAttribute('href', '/account');
  } else {
    await expect(page.getByText('Account sign-in is not configured in this environment. You can continue shopping as a guest.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Your account', exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('list', { name: 'Your orders' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/(?:TEST|DEMO)-[\da-f-]{8,}/i);
  await page.goto(`/account/orders/${missingOrder}`);
  await expect(page).toHaveURL(/\/account\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Items & totals', exact: true })).toHaveCount(0);
});

test('denies anonymous customer APIs and caller-supplied roles or identities', async ({ page }) => {
  const expected = enabled ? 401 : 503;
  for (const route of ['/api/customer/session', '/api/customer/orders', `/api/customer/orders/${missingOrder}`]) {
    await expectDenied(await page.request.get(route), expected);
  }
  await expectDenied(await page.request.get('/api/customer/orders', { headers: {
    Authorization: 'Bearer not-a-customer-session',
    Cookie: 'joys_order_guest=00000000-0000-4000-8000-000000000000; joys_merchant.session_token=not-a-session',
    'X-Customer-User-ID': 'client-supplied-identity', 'X-Customer-Role': 'customer', 'X-Merchant-Role': 'merchant',
  } }), expected);
});

test('keeps extra authentication routes unavailable and rejects cross-origin account writes', async ({ page, baseURL }) => {
  await expectDenied(await page.request.get('/api/customer-auth/get-session'), 404);
  await expectDenied(await page.request.post('/api/customer-auth/sign-up/email', { headers: { Origin: new URL(baseURL).origin }, data: {} }), 404);
  await expectDenied(await page.request.post('/api/customer-auth/link-social', { headers: { Origin: new URL(baseURL).origin }, data: { provider: 'google' } }), 404);
  for (const endpoint of ['sign-out', 'sign-in/social']) {
    await expectDenied(await page.request.post(`/api/customer-auth/${endpoint}`, {
      headers: { Origin: 'https://untrusted.example', 'Sec-Fetch-Site': 'cross-site' }, data: {},
    }), enabled ? 403 : 503);
  }
});
