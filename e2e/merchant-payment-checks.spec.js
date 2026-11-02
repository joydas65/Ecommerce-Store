import { randomUUID } from 'node:crypto';
import { test, expect, browserCookie, origin } from './merchant-fixtures';

const fixtureOrigin = 'http://127.0.0.1:4101';
async function seed(request, scenario) {
  const response = await request.post(`${fixtureOrigin}/__fixtures/orders`, { data: { scenario } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function calls(request, id) {
  const response = await request.get(`${fixtureOrigin}/__fixtures/requests/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function history(request, id) {
  const response = await request.get(`/api/merchant/orders/${id}/payment-checks`);
  expect(response.status()).toBe(200);
  return response.json();
}
const recheck = (request, id, requestId = randomUUID(), headers = {}) => request.post(`/api/merchant/orders/${id}/recheck-payment`, {
  headers: { Origin: origin, ...headers }, data: { requestId },
});

test('merchant recheck verifies a saved Stripe session, records its actor and result, and survives reload', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'paid');
  await page.goto(`/admin/orders/${order.id}`);
  await expect(page.getByRole('button', { name: 'Recheck payment status', exact: true })).toBeEnabled();
  const reply = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/recheck-payment`));
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  const result = await (await reply).json();
  expect(result.order.paymentStatus).toBe('PAID');
  expect(result.check).toMatchObject({ outcome: 'paid', previousPaymentStatus: 'PENDING', resultPaymentStatus: 'PAID' });
  expect(result.check.actor.id).toBeTruthy();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  const timeline = page.getByRole('region', { name: 'Payment check history', exact: true });
  await expect(timeline).toContainText(result.check.actor.displayName);
  await expect(timeline).toContainText('Pending');
  await page.reload();
  await expect(timeline).toContainText(result.check.actor.displayName);
  await expect(page.getByRole('button', { name: 'Recheck payment status', exact: true })).toHaveCount(0);
  const replay = await recheck(merchant.request, order.id, result.check.requestId);
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ replayed: true, check: { id: result.check.id }, order: { paymentStatus: 'PAID' } });
  expect((await history(merchant.request, order.id)).events).toHaveLength(2);
  expect(await calls(merchant.request, order.id)).toEqual({ retrieve: 1, create: 0, expire: 0 });
});

test('ambiguous response can be recovered after reload using the same persisted request', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'paid');
  let requestId;
  let first = true;
  await page.route(`**/api/merchant/orders/${order.id}/recheck-payment`, async (route) => {
    if (!first) return route.continue();
    first = false;
    requestId = route.request().postDataJSON().requestId;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await page.goto(`/admin/orders/${order.id}`);
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recover previous check', exact: true })).toBeVisible();
  await page.reload();
  const reply = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/recheck-payment`));
  await page.getByRole('button', { name: 'Recover previous check', exact: true }).click();
  const recovered = await (await reply).json();
  expect(recovered).toMatchObject({ replayed: true, check: { requestId, outcome: 'paid' } });
  await expect(page.getByRole('button', { name: 'Recover previous check', exact: true })).toHaveCount(0);
  expect((await history(merchant.request, order.id)).events).toHaveLength(2);
  expect(await calls(merchant.request, order.id)).toEqual({ retrieve: 1, create: 0, expire: 0 });
});

test('overlapping browser requests perform one provider check and expose a recoverable in-progress state', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'pending');
  await merchant.request.post(`${fixtureOrigin}/__fixtures/orders/${order.id}`, { data: { scenario: 'paid', delayMs: 1800 } });
  await page.goto(`/admin/orders/${order.id}`);
  const started = page.waitForRequest((request) => request.url().endsWith(`/orders/${order.id}/recheck-payment`));
  const completed = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/recheck-payment`));
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  const requestId = (await started).postDataJSON().requestId;
  const duplicate = await recheck(merchant.request, order.id, requestId);
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).error.code).toBe('PAYMENT_CHECK_IN_PROGRESS');
  expect((await duplicate.json()).error.retryAt).toBeTruthy();
  expect((await completed).status()).toBe(200);
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  expect((await history(merchant.request, order.id)).events).toHaveLength(2);
  expect(await calls(merchant.request, order.id)).toEqual({ retrieve: 1, create: 0, expire: 0 });
});

test('Stripe SDK timeout is audited without confirming payment, and a later check can recover', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'timeout');
  await page.goto(`/admin/orders/${order.id}`);
  const reply = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/recheck-payment`));
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  const result = await (await reply).json();
  expect(result).toMatchObject({ check: { outcome: 'provider_unavailable', resultPaymentStatus: 'PENDING' }, order: { paymentStatus: 'PENDING' } });
  await expect(page.getByRole('region', { name: 'Payment check history', exact: true })).toContainText(/unavailable|could not|couldn.t/i);
  await expect(page.getByText('Paid', { exact: true })).toHaveCount(0);
  await merchant.request.post(`${fixtureOrigin}/__fixtures/orders/${order.id}`, { data: { scenario: 'paid' } });
  await expect(page.getByRole('button', { name: 'Recheck payment status', exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  expect((await history(merchant.request, order.id)).events).toHaveLength(4);
  expect(await calls(merchant.request, order.id)).toEqual({ retrieve: 2, create: 0, expire: 0 });
});

test('a concurrent paid webhook wins over a delayed pending merchant observation', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'pending');
  await merchant.request.post(`${fixtureOrigin}/__fixtures/orders/${order.id}`, { data: { scenario: 'pending', delayMs: 1800 } });
  await page.goto(`/admin/orders/${order.id}`);
  const completed = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/recheck-payment`));
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  await expect.poll(async () => (await calls(merchant.request, order.id)).retrieve).toBe(1);
  await merchant.request.post(`${fixtureOrigin}/__fixtures/orders/${order.id}`, { data: { scenario: 'paid', delayMs: 0 } });
  const webhook = await merchant.request.post(`${fixtureOrigin}/__fixtures/orders/${order.id}/webhook`, { data: {} });
  expect(webhook.status()).toBe(200);
  const result = await (await completed).json();
  expect(result).toMatchObject({ order: { paymentStatus: 'PAID' }, check: { outcome: 'already_resolved', previousPaymentStatus: 'PAID', resultPaymentStatus: 'PAID' } });
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  expect((await history(merchant.request, order.id)).events).toHaveLength(2);
  expect(await calls(merchant.request, order.id)).toEqual({ retrieve: 2, create: 0, expire: 0 });
});

test('mismatched provider evidence stays in review and a missing session cannot create a payment', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'mismatch');
  await page.goto(`/admin/orders/${order.id}`);
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  await expect(page.getByText('Needs review', { exact: true }).first()).toBeVisible();
  expect((await history(merchant.request, order.id)).events[0].outcome).toBe('review_required');
  const missing = await seed(merchant.request, 'missing_session');
  await page.goto(`/admin/orders/${missing.id}`);
  await expect(page.getByRole('heading', { name: 'Payment check history', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recheck payment status', exact: true })).toHaveCount(0);
  const denied = await recheck(merchant.request, missing.id);
  expect(denied.status()).toBe(409);
  expect((await denied.json()).error.code).toBe('PAYMENT_CHECK_NOT_ELIGIBLE');
  expect(await calls(merchant.request, missing.id)).toEqual({ retrieve: 0, create: 0, expire: 0 });
});

test('expired merchant sessions, ordinary users and cross-origin requests cannot trigger a Stripe check', async ({ page, context, sessionFixtures }) => {
  const order = await seed(page.request, 'pending');
  expect((await recheck(page.request, order.id)).status()).toBe(401);
  await context.addCookies([browserCookie(sessionFixtures.ordinary.cookie)]);
  expect((await recheck(page.request, order.id)).status()).toBe(403);
  await context.addCookies([browserCookie(sessionFixtures.expiredCookie)]);
  expect((await recheck(page.request, order.id)).status()).toBe(401);
  await context.addCookies([browserCookie(sessionFixtures.merchant.cookie)]);
  expect((await recheck(page.request, order.id, randomUUID(), { Origin: 'https://attacker.example' })).status()).toBe(403);
  expect((await history(page.request, order.id)).events).toEqual([]);
  expect(await calls(page.request, order.id)).toEqual({ retrieve: 0, create: 0, expire: 0 });
});

test('an expired Stripe checkout is recorded as canceled and audit content fits a narrow screen', async ({ page, merchant }) => {
  const order = await seed(merchant.request, 'expired');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/orders/${order.id}`);
  await page.getByRole('button', { name: 'Recheck payment status', exact: true }).click();
  await expect(page.getByText('Canceled', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Payment check history', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await calls(merchant.request, order.id)).toEqual({ retrieve: 1, create: 0, expire: 0 });
});
