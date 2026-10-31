import { test, expect } from '@playwright/test';

const unavailableMessages = {
  '/': 'The store is temporarily unavailable. Please try again later.',
  '/cart': 'Your cart is temporarily unavailable. Please try again.',
  '/checkout': 'Your cart is temporarily unavailable. Please try again.',
};

for (const [route, message] of Object.entries(unavailableMessages)) {
  test(`${route} supports direct entry and reload without merchant configuration`, async ({ page }) => {
    const pageErrors = [];
    const hydrationErrors = [];
    const providerRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });
    page.on('request', (request) => {
      if (/^https:\/\/(?:api\.chec\.io|js\.stripe\.com|api\.stripe\.com)\//.test(request.url())) {
        providerRequests.push(request.url());
      }
    });

    const response = await page.goto(route);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('link', { name: /Joy's Store/ })).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
    expect(pageErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);
    expect(providerRequests).toEqual([]);
  });
}

test('navigates between the storefront and cart using Next links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Show cart items' }).click();
  await expect(page).toHaveURL('/cart');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(unavailableMessages['/cart']);

  await page.getByRole('link', { name: /Joy's Store/ }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(unavailableMessages['/']);
});

test('returns a usable not-found page for an unknown route', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('link', { name: /Joy's Store/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
