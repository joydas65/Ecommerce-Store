import { test, expect } from './demo-fixture';

test.skip(process.env.E2E_ORDER_STORAGE !== 'remote', 'Requires the real order service and PostgreSQL persistence.');

async function prepareOrder(page, product = 'Notebook') {
  await page.goto('/');
  await page.getByRole('button', { name: `Add to cart: ${product}`, exact: true }).click();
  await expect(page.getByRole('link', { name: /^Cart \d+ items?$/ })).toHaveAccessibleName('Cart 1 item');
  await page.getByRole('link', { name: /^Cart \d+ items?$/ }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample address', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Place demo order/ })).toBeEnabled();
}

async function openReceipt(page) {
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: 'View saved receipt', exact: true });
  await expect(link).toHaveAttribute('href', /^\/orders\/order_[\da-f-]+$/i);
  const path = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();
  return path;
}

test('saves a real demo order, reloads its private receipt, and denies another guest', async ({ page, browser, baseURL }) => {
  await prepareOrder(page);
  await page.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  const path = await openReceipt(page);
  const reference = await page.getByText(/^Order ref: DEMO-/).textContent();
  const apiPath = `/api/demo${path}`;

  await expect(page.getByRole('list', { name: 'Order items' })).toContainText('Notebook');
  await expect(page.getByRole('list', { name: 'Order totals' })).toContainText('$18.36');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('No payment was collected and nothing will be shipped.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  await page.reload();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  const ownResponse = await page.request.get(apiPath);
  expect(ownResponse.status()).toBe(200);
  expect(ownResponse.headers()['cache-control']).toContain('no-store');
  const saved = await ownResponse.json();
  expect(saved).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'SIMULATED', totalCents: 1836 });
  expect(JSON.stringify(saved)).not.toContain('demo@example.com');

  const anotherGuest = await browser.newContext({ baseURL });
  try {
    const denied = await anotherGuest.request.get(apiPath);
    const missing = await anotherGuest.request.get('/api/demo/orders/order_00000000-0000-4000-8000-000000000000');
    expect(denied.status()).toBe(404);
    expect(missing.status()).toBe(404);
    expect(await denied.json()).toEqual(await missing.json());
    const otherPage = await anotherGuest.newPage();
    await otherPage.goto(path);
    await expect(otherPage.getByRole('heading', { name: 'Order not found', exact: true })).toBeVisible();
    await expect(otherPage.getByRole('heading', { name: 'Demo order complete', exact: true })).toHaveCount(0);
  } finally {
    await anotherGuest.close();
  }

  await page.goto('/cart');
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
});

test('recovers the same committed order after its response is lost and the checkout reloads', async ({ page }) => {
  await prepareOrder(page);
  let committedOrder;
  let firstAttempt;
  const retryAttempts = [];
  await page.route('**/api/demo/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const attempt = { body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] };
    if (committedOrder) {
      retryAttempts.push(attempt);
      return route.continue();
    }
    firstAttempt = attempt;
    // The real service commits the order. Only its response to this browser is
    // dropped, reproducing an ambiguous outcome without mocking persistence.
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committedOrder = await response.json();
    await route.abort('failed');
  });

  await page.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  await expect(page.getByRole('button', { name: 'Recover pending order', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toHaveCount(0);
  const localState = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(localState).not.toContain('demo@example.com');

  await page.reload();
  await page.getByRole('button', { name: 'Recover pending order', exact: true }).click();
  const receiptPath = await openReceipt(page);
  expect(receiptPath).toBe(`/orders/${committedOrder.id}`);
  expect(retryAttempts.length).toBeGreaterThanOrEqual(1);
  for (const attempt of retryAttempts) expect(attempt).toEqual(firstAttempt);
  await expect(page.getByText(`Order ref: ${committedOrder.reference}`, { exact: true })).toBeVisible();
  const receiptResponse = await page.request.get(`/api/demo/orders/${committedOrder.id}`);
  expect(await receiptResponse.json()).toEqual(committedOrder);
  await page.goto('/cart');
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
});

test('keeps the cart after a controlled failure and persists the successful retry', async ({ page, context }) => {
  await prepareOrder(page);
  await page.getByRole('checkbox', { name: 'Simulate a payment failure', exact: true }).check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/simulat|demo/i);
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Simulate a payment failure', exact: true })).not.toBeChecked();

  const cartTab = await context.newPage();
  await cartTab.goto('/cart');
  await expect(cartTab.getByText('Subtotal: $12.00', { exact: true })).toBeVisible();
  await cartTab.close();
  await page.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  await openReceipt(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();
});
