import { test, expect } from './demo-fixture';

const products = [
  { slug: 'desk-mat', name: 'Desk Mat', price: '$34.00', specification: '75 × 35 cm' },
  { slug: 'notebook', name: 'Notebook', price: '$12.00', specification: 'A5 · 14.8 × 21 cm' },
  { slug: 'bottle', name: 'Bottle', price: '$28.00', specification: '500 ml' },
  { slug: 'tote', name: 'Tote', price: '$22.00', specification: '38 × 40 × 10 cm' },
  { slug: 'laptop-stand', name: 'Laptop Stand', price: '$48.00', specification: '11–16 inches' },
  { slug: 'desk-lamp', name: 'Desk Lamp', price: '$64.00', specification: 'USB-C · 5 V / 1 A' },
];

async function expectReadableCartAction(action) {
  const colors = await action.evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });
  const luminance = (color) => {
    const channels = color.match(/[\d.]+/g).map(Number);
    expect(channels.length === 3 || (channels.length === 4 && channels[3] === 1), 'The filled cart action must use opaque colors').toBe(true);
    const linear = channels.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const foreground = luminance(colors.foreground);
  const background = luminance(colors.background);
  const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  expect(contrast, 'View cart text must meet WCAG AA contrast against its button background').toBeGreaterThanOrEqual(4.5);
}

for (const product of products) {
  test(`${product.name} supports direct entry and reload with useful product information`, async ({ page }) => {
    const response = await page.goto(`/products/${product.slug}`);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: product.name, level: 1, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${product.name} | Joy's Store`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
    await expect(page.getByRole('main').getByText(product.price, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Why it works', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Specifications', exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText(product.specification, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Care', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Add to cart: ${product.name}`, exact: true })).toBeEnabled();
    const image = page.getByRole('main').getByRole('img', { name: product.name, exact: true });
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty('complete', true);
    await expect(image).not.toHaveJSProperty('naturalWidth', 0);

    const reloaded = await page.reload();
    expect(reloaded.status()).toBe(200);
    await expect(page.getByRole('heading', { name: product.name, level: 1, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Add to cart: ${product.name}`, exact: true })).toBeEnabled();
  });
}

test('opens a product from the catalog, confirms an add, and keeps it in the cart after reload', async ({ page }) => {
  const card = page.getByRole('article', { name: 'Desk Mat', exact: true });
  const detailLink = card.getByRole('link', { name: 'Desk Mat', exact: true });
  await expect(card.getByRole('link')).toHaveCount(1);
  await expect(detailLink).toHaveAttribute('href', '/products/desk-mat');
  await detailLink.click();
  await expect(page).toHaveURL('/products/desk-mat');
  await expect(page.getByRole('heading', { name: 'Desk Mat', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Desk Mat added to your cart.');
  const viewCart = page.getByRole('link', { name: 'View cart', exact: true });
  await expectReadableCartAction(viewCart);
  await viewCart.click();
  await expect(page).toHaveURL('/cart');
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart 1 item', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart 1 item', exact: true })).toBeVisible();
});

async function tabTo(page, target) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target, 'Product actions must be keyboard reachable').toBeFocused();
}

test('keeps product information and purchase actions usable on a narrow phone and from the keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto('/products/desk-mat');
  await expect(page.getByRole('heading', { name: 'Desk Mat', level: 1, exact: true })).toBeVisible();
  const add = page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true });
  for (const element of [page.getByRole('main'), page.getByRole('main').getByRole('img'), add]) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(361);
  }
  const buttonBounds = await add.boundingBox();
  expect(buttonBounds.width).toBeGreaterThanOrEqual(44);
  expect(buttonBounds.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await testInfo.attach('product-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await tabTo(page, add);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Desk Mat added to your cart.');
  const viewCart = page.getByRole('link', { name: 'View cart', exact: true });
  await expectReadableCartAction(viewCart);
  await tabTo(page, viewCart);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/cart');
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
});

test('returns a real product 404 with a way back to the catalog', async ({ page }) => {
  const response = await page.goto('/products/not-a-real-product');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Product not found', level: 1, exact: true })).toBeVisible();
  const robots = page.locator('meta[name="robots"]');
  expect(await robots.count()).toBeGreaterThan(0);
  for (const directive of await robots.all()) await expect(directive).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('button', { name: /^Add to cart:/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to products', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByRole('heading', { name: 'The everyday collection', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(6);
});

test('renders product information on a fresh direct visit without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    const response = await page.goto('/products/desk-mat');
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle("Desk Mat | Joy's Store");
    await expect(page.getByRole('heading', { name: 'Desk Mat', level: 1, exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('$34.00', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Specifications', exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('75 × 35 cm', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('Polyester felt and cork', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Care', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All products', exact: true })).toHaveAttribute('href', '/#products');
    await expect(page.getByRole('heading', { name: 'Loading product', exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
