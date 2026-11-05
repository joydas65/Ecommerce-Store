import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as merchantTest, expect, browserCookie, createSyntheticOrder, origin } from './merchant-fixtures';

const runFile = promisify(execFile);
const backendDirectory = process.env.E2E_ORDERS_SERVICE_DIR || (existsSync('.orders-service/package.json') ? '.orders-service' : '../Ecommerce-Orders');
const missingOrder = 'order_00000000-0000-4000-8000-000000000000';

function customerCookie(raw) {
  const equals = raw.indexOf('=');
  if (equals < 1 || !raw.startsWith('joys_customer.session_token=')) throw new Error('Unexpected local customer fixture cookie.');
  return { name: raw.slice(0, equals), value: raw.slice(equals + 1), url: origin, httpOnly: true, sameSite: 'Lax' };
}

const test = merchantTest.extend({
  customerSessions: async ({ baseURL }, provide) => {
    if (baseURL !== origin) throw new Error('Customer fixtures require the local storefront origin.');
    const directory = await mkdtemp(path.join(tmpdir(), 'customer-browser-'));
    try {
      const file = path.join(directory, 'sessions.json');
      await runFile(process.execPath, [path.resolve(backendDirectory, 'scripts/test/seed-customer-session.mjs'), file], {
        cwd: path.resolve(backendDirectory), env: {
          ...process.env,
          CUSTOMER_TEST_FIXTURES: 'true', CUSTOMER_AUTH_ENABLED: 'true', CUSTOMER_ALLOW_LOCAL_AUTH: 'true', CUSTOMER_AUTH_URL: origin,
          CUSTOMER_AUTH_SECRET: process.env.CUSTOMER_AUTH_SECRET || 'local-customer-signing-secret-at-least-32-characters',
          GOOGLE_CLIENT_ID: 'fixture-google.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-google-secret-at-least-20',
        }, timeout: 30_000,
      });
      const fixture = JSON.parse(await readFile(file, 'utf8'));
      await rm(file);
      await provide(fixture);
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
  customer: async ({ context, customerSessions }, provide) => {
    await context.addCookies([customerCookie(customerSessions.customer.cookie)]);
    await provide(context);
  },
});

async function expectCustomerReceipt(page, order) {
  await expect(page.getByRole('heading', { name: 'Your receipt', exact: true })).toBeVisible();
  await expect(page.getByText(order.reference, { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your purchased items' })).toContainText('Notebook');
  await expect(page.getByRole('definition').filter({ hasText: '$18.36' })).toBeVisible();
  await expect(page.getByText('Simulated purchase', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
}

test('a signed-in purchase appears in My orders and its receipt reloads in a fresh customer-only browser', async ({ page, customer, browser, baseURL, customerSessions }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart: Notebook', exact: true }).click();
  await page.getByRole('link', { name: 'Cart 1 item', exact: true }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample address', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  const receipt = page.getByRole('link', { name: 'View saved receipt', exact: true });
  await expect(receipt).toBeVisible();
  const guestReceiptPath = await receipt.getAttribute('href');
  const saved = await customer.request.get(`/api${guestReceiptPath}`);
  expect(saved.status()).toBe(200);
  const order = await saved.json();
  await page.getByRole('link', { name: 'Your account', exact: true }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByRole('heading', { name: 'My orders', exact: true })).toBeVisible();
  await page.getByRole('link', { name: order.reference, exact: true }).click();
  await expect(page).toHaveURL(`/account/orders/${order.id}`);
  await expectCustomerReceipt(page, order);
  await page.reload();
  await expectCustomerReceipt(page, order);

  const anotherDevice = await browser.newContext({ baseURL });
  try {
    await anotherDevice.addCookies([customerCookie(customerSessions.customer.cookie)]);
    const newPage = await anotherDevice.newPage();
    await newPage.goto(`/account/orders/${order.id}`);
    await expectCustomerReceipt(newPage, order);
    const response = await anotherDevice.request.get(`/api/customer/orders/${order.id}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ id: order.id, paymentStatus: 'SIMULATED', totalCents: 1836 });
    expect(response.headers()['cache-control']).toContain('no-store');
  } finally { await anotherDevice.close(); }
});

test('another signed-in customer cannot list or open someone else’s receipt', async ({ page, customer, browser, baseURL, customerSessions }) => {
  const order = await createSyntheticOrder(customer.request);
  const another = await browser.newContext({ baseURL });
  try {
    await another.addCookies([customerCookie(customerSessions.other.cookie)]);
    const denied = await another.request.get(`/api/customer/orders/${order.id}`);
    const missing = await another.request.get(`/api/customer/orders/${missingOrder}`);
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toEqual(await missing.json());
    const list = await another.request.get('/api/customer/orders');
    expect(list.status()).toBe(200);
    expect((await list.json()).orders).toEqual([]);
    const otherPage = await another.newPage();
    await otherPage.goto(`/account/orders/${order.id}`);
    await expect(otherPage.getByRole('heading', { name: 'Order not found', exact: true })).toBeVisible();
    await expect(otherPage.getByText(order.reference, { exact: true })).toHaveCount(0);
  } finally { await another.close(); }
  await page.goto('/account');
  await expect(page.getByRole('link', { name: order.reference, exact: true })).toBeVisible();
});

test('guest, customer and merchant cookies keep their separate access boundaries and guest history stays private', async ({ page, context, customerSessions, sessionFixtures }) => {
  const guestOrder = await createSyntheticOrder(page.request);
  expect((await page.request.get('/api/customer/orders')).status()).toBe(401);
  await page.goto('/account');
  await expect(page).toHaveURL('/account/sign-in');
  await context.addCookies([browserCookie(sessionFixtures.merchant.cookie)]);
  expect((await page.request.get('/api/merchant/orders')).status()).toBe(200);
  expect((await page.request.get('/api/customer/orders')).status()).toBe(401);
  expect((await page.request.get(`/api/customer/orders/${guestOrder.id}`)).status()).toBe(401);
  await context.clearCookies({ name: 'joys_merchant.session_token' });
  await context.addCookies([customerCookie(customerSessions.customer.cookie)]);
  expect((await page.request.get('/api/merchant/orders')).status()).toBe(401);
  expect((await page.request.get(`/api/customer/orders/${guestOrder.id}`)).status()).toBe(404);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Your next purchase starts here', exact: true })).toBeVisible();
  await expect(page.getByText(/Earlier guest purchases remain in the browser/)).toBeVisible();
  expect((await page.request.get(`/api/orders/${guestOrder.id}`)).status()).toBe(200);
});

test('customer sign-out revokes the saved session while a separate merchant session remains valid', async ({ page, customer, browser, baseURL, customerSessions, sessionFixtures }) => {
  const order = await createSyntheticOrder(customer.request);
  await customer.addCookies([browserCookie(sessionFixtures.merchant.cookie)]);
  await page.goto('/account');
  await expect(page.getByRole('link', { name: order.reference, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/account/sign-in');
  expect((await customer.request.get('/api/customer/orders')).status()).toBe(401);
  expect((await customer.request.get('/api/merchant/orders')).status()).toBe(200);
  const replay = await browser.newContext({ baseURL });
  try {
    await replay.addCookies([customerCookie(customerSessions.customer.cookie)]);
    expect((await replay.request.get(`/api/customer/orders/${order.id}`)).status()).toBe(401);
  } finally { await replay.close(); }
});

test('expired customer sessions require sign-in and the mobile empty state fits the viewport', async ({ page, context, customerSessions }) => {
  await context.addCookies([customerCookie(customerSessions.expiredCookie)]);
  expect((await page.request.get('/api/customer/orders')).status()).toBe(401);
  await page.goto('/account');
  await expect(page).toHaveURL('/account/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible();
  await context.addCookies([customerCookie(customerSessions.customer.cookie)]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Your next purchase starts here', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore the collection', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

async function captureGoogleNavigation(page, action) {
  let captured;
  await page.route('https://accounts.google.com/**', async (route) => {
    captured = new URL(route.request().url());
    await route.abort();
  });
  await action();
  await expect.poll(() => captured?.origin).toBe('https://accounts.google.com');
  expect(captured.pathname).toBe('/o/oauth2/v2/auth');
  expect(captured.searchParams.get('client_id')).toBe('fixture-google.apps.googleusercontent.com');
  expect(captured.searchParams.get('scope').split(' ').sort()).toEqual(['email', 'openid', 'profile']);
  expect(captured.searchParams.get('state')).toBeTruthy();
  expect(captured.searchParams.get('code_challenge_method')).toBe('S256');
  expect(captured.searchParams.get('nonce')).toBeTruthy();
  return captured;
}

test('customer Google sign-in starts the real backend OAuth flow with only basic identity scopes', async ({ page }) => {
  await page.goto('/account/sign-in');
  const target = await captureGoogleNavigation(page, () => page.getByRole('button', { name: 'Sign in with Google', exact: true }).click());
  expect(target.searchParams.get('redirect_uri')).toBe(`${origin}/api/customer-auth/callback/google`);
});

test('an approved merchant can explicitly connect Google through the distinct merchant OAuth callback', async ({ page, merchant }) => {
  await page.goto('/admin/orders');
  const target = await captureGoogleNavigation(page, () => page.getByRole('button', { name: 'Connect Google', exact: true }).click());
  expect(target.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/google`);
  const state = await merchant.request.get('/api/merchant/session');
  expect(state.status()).toBe(200);
  expect((await state.json()).authentication).toMatchObject({ googleEnabled: true, googleLinked: false });
});
