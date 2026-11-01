import { test, expect } from './demo-fixture';

test('serves the demo with release identity, metadata, keyboard navigation, and working direct routes', async ({ page, baseURL }, testInfo) => {
  const health = await page.request.get(new URL('/api/health', baseURL).href);
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toContain('no-store');
  const release = await health.json();
  expect(release).toMatchObject({ status: 'ok', mode: 'demo' });
  if (process.env.E2E_EXPECTED_COMMIT_SHA) {
    expect(release.commit).toBe(process.env.E2E_EXPECTED_COMMIT_SHA);
  }
  await testInfo.attach('release.json', { body: JSON.stringify(release, null, 2), contentType: 'application/json' });

  // The shared fixture has opened the initial document with a fresh context.
  await expect(page).toHaveTitle("Joy's Store");
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /shipping.*order confirmation/i);
  await expect(page.getByRole('heading', { name: 'Everyday essentials. A calmer workspace.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Add to cart: / })).toHaveCount(6);

  // Record a single-run navigation baseline, not a claimed Core Web Vitals score.
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    return {
      measurement: 'Single browser navigation; no performance pass/fail threshold',
      ttfbMs: Math.round(navigation.responseStart - navigation.requestStart),
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
      loadMs: Math.round(navigation.loadEventEnd),
      documentTransferBytes: navigation.transferSize,
    };
  });
  await testInfo.attach('navigation-baseline.json', { body: JSON.stringify(timing, null, 2), contentType: 'application/json' });

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Joy's Store/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /^Cart \d+ items?$/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/cart');
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();

  const checkout = await page.goto('/checkout');
  expect(checkout.status()).toBe(200);
  await expect(page.getByText('Your cart is empty. Add a product to start checkout.', { exact: true })).toBeVisible();
  const missing = await page.goto('/this-page-does-not-exist');
  expect(missing.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
