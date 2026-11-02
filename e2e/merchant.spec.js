import { test, expect, browserCookie, createSyntheticOrder } from './merchant-fixtures';

test('guest access redirects to sign-in and cannot read merchant APIs', async ({ page }) => {
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/sign-in(?:\?|$)/);
  await expect(page.getByRole('button', { name: /Sign in with GitHub/i })).toBeVisible();
  const denied = await page.request.get('/api/merchant/orders');
  expect(denied.status()).toBe(401);
  expect(denied.headers()['cache-control']).toContain('no-store');
  const detail = await page.request.get('/api/merchant/orders/order_00000000-0000-4000-8000-000000000000');
  expect(detail.status()).toBe(401);
});

test('an ordinary authenticated user cannot access merchant orders', async ({ page, context, sessionFixtures }) => {
  await context.addCookies([browserCookie(sessionFixtures.ordinary.cookie)]);
  const denied = await page.request.get('/api/merchant/orders');
  expect(denied.status()).toBe(403);
  const detail = await page.request.get('/api/merchant/orders/order_00000000-0000-4000-8000-000000000000');
  expect(detail.status()).toBe(403);
  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: 'Merchant access required', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Merchant orders' })).toHaveCount(0);
});

test('a completed shopper purchase appears in the real merchant inbox and reloadable order detail', async ({ page, browser, baseURL, sessionFixtures }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart: Notebook', exact: true }).click();
  await page.getByRole('link', { name: 'Cart 1 item', exact: true }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample address', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  const receiptLink = page.getByRole('link', { name: 'View saved receipt', exact: true });
  await expect(receiptLink).toBeVisible();
  const receiptPath = await receiptLink.getAttribute('href');
  const saved = await page.request.get(`/api${receiptPath}`);
  expect(saved.status()).toBe(200);
  const order = await saved.json();
  const merchantContext = await browser.newContext({ baseURL });
  try {
    await merchantContext.addCookies([browserCookie(sessionFixtures.merchant.cookie)]);
    const merchantPage = await merchantContext.newPage();
    await merchantPage.goto('/admin/orders?status=simulated');
    const orderLink = merchantPage.getByRole('link', { name: order.reference, exact: true });
    await expect(orderLink).toBeVisible();
    await orderLink.click();
    await expect(merchantPage).toHaveURL(`/admin/orders/${order.id}`);
    await expect(merchantPage.getByText('Notebook', { exact: true })).toBeVisible();
    await expect(merchantPage.getByText('Simulated', { exact: true })).toBeVisible();
    await expect(merchantPage.getByText('$18.36', { exact: true })).toBeVisible();
    await expect(merchantPage.getByText('$5.00', { exact: true })).toBeVisible();
    await expect(merchantPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await merchantPage.reload();
    await expect(merchantPage.getByText(order.reference, { exact: true })).toBeVisible();
    const detail = await merchantContext.request.get(`/api/merchant/orders/${order.id}`);
    expect(detail.status()).toBe(200);
    expect(await detail.json()).toMatchObject({ id: order.id, paymentStatus: 'SIMULATED', totalCents: 1836 });
    expect(detail.headers()['cache-control']).toContain('no-store');
  } finally { await merchantContext.close(); }
});

test('uses real cursor pagination, persists filters on reload, and supports browser history', async ({ page, merchant }) => {
  for (let index = 0; index < 21; index += 1) await createSyntheticOrder(merchant.request);
  await page.goto('/admin/orders?status=simulated');
  const table = page.getByRole('table', { name: 'Merchant orders' });
  await expect(table).toBeVisible();
  const firstReferences = await table.getByRole('link').allTextContents();
  expect(firstReferences).toHaveLength(20);
  await page.getByRole('button', { name: 'Older orders', exact: true }).click();
  await expect(page).toHaveURL(/status=simulated&cursor=/);
  await expect(table.getByRole('link').first()).not.toHaveText(firstReferences[0]);
  const secondReferences = await table.getByRole('link').allTextContents();
  expect(secondReferences.length).toBeGreaterThan(0);
  expect(secondReferences.some((reference) => firstReferences.includes(reference))).toBe(false);
  await page.getByRole('button', { name: 'Newer orders', exact: true }).click();
  await expect(page).toHaveURL('/admin/orders?status=simulated');
  await expect(table.getByRole('link').first()).toHaveText(firstReferences[0]);
  await page.getByRole('combobox', { name: 'Payment status', exact: true }).selectOption('review');
  await expect(page).toHaveURL('/admin/orders?status=review');
  const filtered = await merchant.request.get('/api/merchant/orders?status=review');
  expect(filtered.status()).toBe(200);
  const reviewOrders = (await filtered.json()).orders;
  if (reviewOrders.length) {
    await expect(table).toBeVisible();
    for (const order of reviewOrders) expect(order.paymentStatus).toBe('REQUIRES_REVIEW');
  } else {
    await expect(page.getByRole('heading', { name: 'No orders need review', exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Payment status', exact: true })).toHaveValue('review');
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Payment status', exact: true })).toHaveValue('simulated');
  await expect(table.getByRole('link').first()).toHaveText(firstReferences[0]);
});

test('shows bounded loading and a recoverable API failure after server authentication', async ({ page, merchant }) => {
  await createSyntheticOrder(merchant.request);
  let release;
  let first = true;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/merchant/orders?*', async (route) => {
    if (!first) return route.continue();
    first = false;
    await pending;
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }) });
  });
  try {
    await page.goto('/admin/orders');
    await expect(page.getByRole('status')).toContainText('Loading orders');
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Orders temporarily unavailable', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Merchant orders' })).toBeVisible();
});

test('merchant mobile layout fits the viewport and a missing order has a useful recovery link', async ({ page, merchant }) => {
  await createSyntheticOrder(merchant.request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/orders');
  await expect(page.getByRole('table', { name: 'Merchant orders' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/admin/orders/order_00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Order not found', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to orders', exact: true })).toBeVisible();
});

test('sign-out revokes the saved session instead of only hiding merchant navigation', async ({ page, merchant, browser, baseURL, sessionFixtures }) => {
  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  const before = await merchant.request.get('/api/merchant/orders');
  expect(before.status()).toBe(200);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sign-in(?:\?|$)/);
  const after = await merchant.request.get('/api/merchant/orders');
  expect(after.status()).toBe(401);
  const replay = await browser.newContext({ baseURL });
  try {
    await replay.addCookies([browserCookie(sessionFixtures.merchant.cookie)]);
    const denied = await replay.request.get('/api/merchant/orders');
    expect(denied.status()).toBe(401);
  } finally { await replay.close(); }
});
