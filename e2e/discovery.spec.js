import { test, expect } from './demo-fixture';

const featured = ['Desk Mat', 'Notebook', 'Bottle', 'Tote', 'Laptop Stand', 'Desk Lamp'];
const ascendingPrice = ['Notebook', 'Tote', 'Bottle', 'Desk Mat', 'Laptop Stand', 'Desk Lamp'];
const alphabetical = ['Bottle', 'Desk Lamp', 'Desk Mat', 'Laptop Stand', 'Notebook', 'Tote'];
const names = (page) => page.getByRole('article').getByRole('heading', { level: 3 });
const search = (page) => page.getByRole('searchbox', { name: 'Search products', exact: true });
const sort = (page) => page.getByRole('combobox', { name: 'Sort products', exact: true });

async function submitSearch(page, query) {
  await search(page).fill(query);
  await search(page).press('Enter');
}

test('opens and reloads a shared search and sort URL with matching controls and results', async ({ page }) => {
  const response = await page.goto('/?q=desk&sort=price-desc');
  expect(response.status()).toBe(200);
  await expect(search(page)).toHaveValue('desk');
  await expect(sort(page)).toHaveValue('price-desc');
  await expect(names(page)).toHaveText(['Desk Lamp', 'Laptop Stand', 'Desk Mat', 'Bottle']);

  await page.reload();
  await expect(search(page)).toHaveValue('desk');
  await expect(sort(page)).toHaveValue('price-desc');
  await expect(names(page)).toHaveText(['Desk Lamp', 'Laptop Stand', 'Desk Mat', 'Bottle']);
});

test('submits a normalized specification search explicitly and preserves it when sorting', async ({ page }) => {
  await expect(names(page)).toHaveText(featured);
  await search(page).fill('  cork   backing  ');
  // A draft does not change the applied result set or create browser history.
  await expect(names(page)).toHaveText(featured);
  await expect(page).toHaveURL((url) => !url.searchParams.has('q'));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(names(page)).toHaveText(['Desk Mat']);
  await expect(search(page)).toHaveValue('cork backing');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'cork backing' && url.hash === '#products');
  await sort(page).selectOption('price-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'cork backing' && url.searchParams.get('sort') === 'price-desc');
  await expect(names(page)).toHaveText(['Desk Mat']);
});

test('orders by numeric price and name, then restores the featured collection', async ({ page }) => {
  await sort(page).selectOption('price-asc');
  await expect(names(page)).toHaveText(ascendingPrice);
  await sort(page).selectOption('price-desc');
  await expect(names(page)).toHaveText([...ascendingPrice].reverse());
  await sort(page).selectOption('name-asc');
  await expect(names(page)).toHaveText(alphabetical);
  await sort(page).selectOption('featured');
  await expect(names(page)).toHaveText(featured);
  await expect(page).toHaveURL((url) => !url.searchParams.has('sort') && !url.searchParams.has('q'));
});

test('explains no matches, clears only the query, and can reset all discovery controls', async ({ page }) => {
  await page.goto('/?q=unicorn-spaceship&sort=name-asc&utm_source=portfolio');
  await expect(page.getByRole('heading', { name: 'No products found', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('unicorn-spaceship');
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Add to cart:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search(page)).toHaveValue('');
  await expect(search(page)).toBeFocused();
  await expect(sort(page)).toHaveValue('name-asc');
  await expect(names(page)).toHaveText(alphabetical);
  await expect(page).toHaveURL((url) => !url.searchParams.has('q') && url.searchParams.get('sort') === 'name-asc' && url.searchParams.get('utm_source') === 'portfolio');

  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(names(page)).toHaveText(featured);
  await expect(sort(page)).toHaveValue('featured');
  await expect(search(page)).toBeFocused();
  await expect(page).toHaveURL((url) => !url.searchParams.has('q') && !url.searchParams.has('sort') && url.searchParams.get('utm_source') === 'portfolio');
  await expect(page.getByRole('button', { name: 'Reset filters', exact: true })).toHaveCount(0);
});

test('restores applied query, sort, and results through browser Back and Forward', async ({ page }) => {
  await submitSearch(page, 'cork');
  await expect(names(page)).toHaveText(['Desk Mat']);
  await sort(page).selectOption('price-desc');
  await expect(sort(page)).toHaveValue('price-desc');
  await submitSearch(page, 'cotton');
  await expect(names(page)).toHaveText(['Tote']);

  await page.goBack();
  await expect(search(page)).toHaveValue('cork');
  await expect(sort(page)).toHaveValue('price-desc');
  await expect(names(page)).toHaveText(['Desk Mat']);
  await page.goBack();
  await expect(search(page)).toHaveValue('cork');
  await expect(sort(page)).toHaveValue('featured');
  await page.goBack();
  await expect(search(page)).toHaveValue('');
  await expect(names(page)).toHaveText(featured);
  await page.goForward();
  await expect(search(page)).toHaveValue('cork');
  await expect(sort(page)).toHaveValue('featured');
  await expect(names(page)).toHaveText(['Desk Mat']);
});

test('returns from a product detail page to the same shared results', async ({ page }) => {
  await page.goto('/?q=cork&sort=price-desc');
  await expect(names(page)).toHaveText(['Desk Mat']);
  await page.getByRole('article', { name: 'Desk Mat', exact: true }).getByRole('link', { name: 'Desk Mat', exact: true }).click();
  await expect(page).toHaveURL('/products/desk-mat');
  await page.goBack();
  await expect(search(page)).toHaveValue('cork');
  await expect(sort(page)).toHaveValue('price-desc');
  await expect(names(page)).toHaveText(['Desk Mat']);
});

test('adds a filtered product with confirmed feedback and retains the cart on reload', async ({ page }) => {
  await page.goto('/?q=cork&sort=name-asc');
  await expect(names(page)).toHaveText(['Desk Mat']);
  await page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Desk Mat added to your cart.');
  await page.getByRole('link', { name: 'View cart', exact: true }).click();
  await expect(page).toHaveURL('/cart');
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart 1 item', exact: true })).toBeVisible();
});

test('returns focus to search when a confirmed product is hidden by the next search', async ({ page }) => {
  await page.goto('/?q=cork');
  await page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Desk Mat added to your cart.');
  await submitSearch(page, 'cotton');
  await expect(names(page)).toHaveText(['Tote']);
  await expect(page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dismiss cart confirmation', exact: true }).click();
  await expect(search(page)).toBeFocused();
  await expect(page.getByRole('status')).toBeEmpty();
  await expect(page.getByRole('link', { name: 'Cart 1 item', exact: true })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`keeps discovery controls and empty recovery usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(search(page)).toBeVisible();
    const submit = page.getByRole('button', { name: 'Search', exact: true });
    for (const control of [search(page), sort(page), submit]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await search(page).focus();
    await page.keyboard.type('cork');
    await page.keyboard.press('Enter');
    await expect(names(page)).toHaveText(['Desk Mat']);
    await sort(page).focus();
    // Native select type-ahead works across platforms without relying on an
    // operating-system popup that headless Chrome cannot drive with arrows.
    await page.keyboard.press('p');
    await page.keyboard.press('Tab');
    await expect(sort(page)).toHaveValue('price-asc');
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'cork' && url.searchParams.get('sort') === 'price-asc');

    await submitSearch(page, 'unmatched'.repeat(12));
    await expect(page.getByRole('heading', { name: 'No products found', exact: true })).toBeVisible();
    const clear = page.getByRole('button', { name: 'Clear search', exact: true });
    const bounds = await clear.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await testInfo.attach(`discovery-empty-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await clear.click();
    await expect(search(page)).toBeFocused();
    await expect(names(page)).toHaveText(ascendingPrice);
  });
}

test('treats special query characters as text and falls back from an unknown sort safely', async ({ page }) => {
  const query = '<img src=x onerror=alert(1)> & ? /';
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(`/?q=${encodeURIComponent(query)}&sort=not-a-sort`);
  await expect(search(page)).toHaveValue(query);
  await expect(sort(page)).toHaveValue('featured');
  await expect(page.getByRole('heading', { name: 'No products found', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(query);
  expect(dialogs).toEqual([]);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(names(page)).toHaveText(featured);
  await expect(page).toHaveURL((url) => !url.searchParams.has('q') && !url.searchParams.has('sort'));
});
