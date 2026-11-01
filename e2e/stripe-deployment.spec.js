import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';

const test = base.extend({
  verifiedStripeDeployment: [async ({ page, context, baseURL }, use) => {
    if (!process.env.E2E_DEPLOYED || !process.env.E2E_BASE_URL) throw new Error('This gate requires a verified deployed origin.');
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
    expect(await health.json()).toMatchObject({ status: 'ok', orderStorage: 'remote',
      providers: { catalog: 'seeded', payment: 'stripe', orders: 'remote' },
      commit: process.env.E2E_EXPECTED_COMMIT_SHA });
    await page.goto('/');
    await expect(page.getByRole('note')).toContainText('Stripe test checkout');
    await expect(page.getByRole('note')).toContainText('No real money');
    await use();
    expect(errors, 'Browser and hydration errors').toEqual([]);
    expect(external, 'The release gate must not navigate to payment providers or enter card data').toEqual([]);
  }, { auto: true }],
});

test('publishes the expected seeded catalog and direct product routes in Stripe test mode', async ({ page }) => {
  await expect(page).toHaveTitle("Joy's Store");
  await expect(page.getByRole('button', { name: /^Add to cart: / })).toHaveCount(6);
  for (const image of await page.getByRole('main').getByRole('img').all()) {
    await expect(image).toHaveAttribute('src', /^\/demo\//);
    await expect(image).toHaveJSProperty('complete', true);
    await expect(image).not.toHaveJSProperty('naturalWidth', 0);
  }
  await page.goto('/products/notebook');
  await expect(page.getByRole('heading', { name: 'Notebook', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add to cart: Notebook', exact: true })).toBeVisible();
  const missing = await page.goto('/products/not-a-product');
  expect(missing.status()).toBe(404);
});

test('creates one unpaid sandbox session, protects its receipt and cancels without clearing the cart', async ({ page, browser, baseURL }, testInfo) => {
  const origin = new URL(baseURL).origin;
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  const submissionKey = randomUUID();
  let quoteId;
  let orderId;
  let submissionAttempted = false;
  let canceled = false;
  let originalFailure;
  let cleanupFailure;
  try {
    await page.getByRole('button', { name: 'Add to cart: Notebook', exact: true }).click();
    await expect(page.getByRole('link', { name: /^Cart \d+ items?$/ })).toHaveAccessibleName('Cart 1 item');
    const quoteResponse = await page.request.post('/api/checkout/quotes', { headers, data: {
      items: [{ productId: 'demo-notebook', quantity: 1 }], shippingMethod: 'demo-standard',
      destination: { country: 'US', region: 'CA' }, paymentProvider: 'stripe-test',
    } });
    expect(quoteResponse.status()).toBe(201);
    const quote = await quoteResponse.json();
    expect(quote).toMatchObject({ paymentProvider: 'stripe-test', shippingCents: 500, totalCents: 1836 });
    quoteId = quote.id;
    submissionAttempted = true;
    const sessionResponse = await page.request.post('/api/payment-sessions', {
      headers: { ...headers, 'Idempotency-Key': submissionKey }, data: { quoteId },
    });
    expect(sessionResponse.status()).toBe(201);
    const session = await sessionResponse.json();
    orderId = session.order.id;
    expect(session.order).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'PENDING',
      paymentProvider: 'stripe-test', paymentMode: 'test', totalCents: 1836 });
    expect(new URL(session.checkoutUrl).origin).toBe('https://checkout.stripe.com');
    // Deliberately never navigate to checkoutUrl or enter payment information.
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole('heading', { name: 'Payment awaiting confirmation', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Payment awaiting confirmation', exact: true })).toBeVisible();
    const anotherGuest = await browser.newContext({ baseURL });
    try {
      const forbidden = await anotherGuest.request.get(`/api/orders/${orderId}`);
      expect(forbidden.status()).toBe(404);
    } finally { await anotherGuest.close(); }
    await page.getByRole('button', { name: 'Cancel checkout', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Checkout canceled', exact: true })).toBeVisible();
    const saved = await page.request.get(`/api/orders/${orderId}`);
    expect(await saved.json()).toMatchObject({ status: 'CANCELED', paymentStatus: 'CANCELED', paymentMode: 'test' });
    canceled = true;
    await page.goto('/cart');
    await expect(page.getByText('Subtotal: $12.00', { exact: true })).toBeVisible();
  } catch (error) {
    originalFailure = error;
    throw error;
  } finally {
    // Creation may have committed even when its response disappeared. Replay
    // the same attempt once before cleanup; never create a replacement attempt.
    try {
      if (!orderId && submissionAttempted) {
        const recovered = await page.request.post('/api/payment-sessions', {
          headers: { ...headers, 'Idempotency-Key': submissionKey }, data: { quoteId }, timeout: 15_000,
        });
        expect(recovered.ok(), 'Recover the original synthetic session for cleanup').toBe(true);
        const result = await recovered.json();
        expect(result.order?.id).toMatch(/^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i);
        orderId = result.order.id;
      }
      if (orderId && !canceled) {
        const cleanup = await page.request.post(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
          headers, data: {}, timeout: 15_000,
        });
        expect(cleanup.ok(), 'Cancel the synthetic unpaid release-check session').toBe(true);
      }
    } catch (cleanupError) {
      cleanupFailure = cleanupError;
      // Keep the original failure as the actionable test result. Report the
      // cleanup limitation without leaking session URLs, cookies or payloads.
      if (originalFailure) testInfo.annotations.push({ type: 'cleanup-warning',
        description: 'The bounded attempt recovery/cancellation failed; inspect this synthetic checkout before rerunning the release gate.' });
    }
  }
  if (cleanupFailure) throw cleanupFailure;
});
