import { test as base, expect } from '@playwright/test';

const test = base.extend({
  verifiedMerchantDeployment: [async ({ page, context, baseURL }, provide) => {
    if (!process.env.E2E_DEPLOYED || !process.env.E2E_BASE_URL || !/^[\da-f]{40}$/i.test(process.env.E2E_EXPECTED_COMMIT_SHA || '')) {
      throw new Error('Merchant release checks require a deployed origin and exact commit SHA.');
    }
    if (!['true', 'false'].includes(process.env.E2E_MERCHANT_ENABLED)) {
      throw new Error('Set E2E_MERCHANT_ENABLED explicitly for this deployment.');
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
    expect((await context.cookies()).filter((cookie) => cookie.name.includes('joys_merchant'))).toHaveLength(0);
    await provide();
    expect(errors, 'Merchant browser and hydration errors').toEqual([]);
    expect(external, 'The public merchant gate must never navigate to an identity or payment provider').toEqual([]);
    expect((await context.cookies()).filter((cookie) => cookie.name.includes('joys_merchant'))).toHaveLength(0);
  }, { auto: true }],
});

const enabled = process.env.E2E_MERCHANT_ENABLED === 'true';
const missingOrder = 'order_00000000-0000-4000-8000-000000000000';

async function expectDenied(response, status) {
  expect(response.status()).toBe(status);
  expect(response.headers()['cache-control']).toContain('no-store');
  const body = await response.json();
  expect(body).toEqual({ error: { code: expect.any(String), message: expect.any(String) } });
}

test('keeps merchant pages behind sign-in without exposing private order records', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'A clear view of every order.', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  if (enabled) {
    await expect(page.getByRole('button', { name: 'Sign in with GitHub', exact: true })).toBeEnabled();
  } else {
    await expect(page.getByText('Merchant sign-in is not configured in this environment. The public storefront remains available.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with GitHub', exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('table', { name: 'Merchant orders' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/(?:TEST|DEMO)-[\da-f-]{8,}/i);
  await page.goto(`/admin/orders/${missingOrder}`);
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Items & totals', exact: true })).toHaveCount(0);
});

test('denies unauthenticated merchant APIs and rejects spoofed identity headers', async ({ page }) => {
  const expected = enabled ? 401 : 503;
  for (const route of ['/api/merchant/orders', `/api/merchant/orders/${missingOrder}`, '/api/merchant/session']) {
    await expectDenied(await page.request.get(route), expected);
  }
  const spoofed = await page.request.get('/api/merchant/orders', { headers: {
    Authorization: 'Bearer not-a-merchant-credential',
    'X-Guest-ID': '00000000-0000-4000-8000-000000000000',
    'X-Merchant-Role': 'merchant',
    'X-Merchant-User-ID': 'client-supplied-identity',
  } });
  await expectDenied(spoofed, expected);
});

test('keeps unsupported auth endpoints unavailable and rejects cross-origin sign-out', async ({ page, baseURL }) => {
  await expectDenied(await page.request.get('/api/auth/get-session'), 404);
  await expectDenied(await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: new URL(baseURL).origin }, data: {},
  }), 404);
  if (enabled) {
    await expectDenied(await page.request.post('/api/auth/sign-out', {
      headers: { Origin: 'https://untrusted.example', 'Sec-Fetch-Site': 'cross-site' }, data: {},
    }), 403);
  }
});
