import { test, expect } from './demo-fixture';

const products = [
  { name: 'Desk Mat', price: '$34.00' },
  { name: 'Notebook', price: '$12.00' },
  { name: 'Bottle', price: '$28.00' },
  { name: 'Tote', price: '$22.00' },
  { name: 'Laptop Stand', price: '$48.00' },
  { name: 'Desk Lamp', price: '$64.00' },
];

for (const width of [360, 390, 768, 1440]) {
  test(`keeps products, prices, and add actions usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everyday essentials. A calmer workspace.');
    await expect(page.getByRole('article')).toHaveCount(6);

    for (const product of products) {
      const card = page.getByRole('article', { name: product.name, exact: true });
      await expect(card.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
      await expect(card.getByText(product.price, { exact: true })).toBeVisible();
      const button = card.getByRole('button', { name: `Add to cart: ${product.name}`, exact: true });
      await expect(button).toBeEnabled();
      await expect(button).toHaveText('Add to cart');

      // Verify real rendered boundaries, not particular grid columns or CSS rules.
      for (const element of [card, card.getByRole('img'), button]) {
        const bounds = await element.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      }
      const target = await button.boundingBox();
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await testInfo.attach(`catalog-${width}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true }).click();
    const confirmation = page.getByRole('status');
    await expect(confirmation).toContainText('Desk Mat added to your cart.');
    for (const action of [
      confirmation.getByRole('link', { name: 'View cart', exact: true }),
      confirmation.getByRole('button', { name: 'Dismiss cart confirmation', exact: true }),
    ]) {
      await expect(action).toBeVisible();
      const bounds = await action.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(901);
    }
    await testInfo.attach(`catalog-confirmation-${width}.png`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

async function tabTo(page, target) {
  for (let step = 0; step < 16; step += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target, 'The action must be reachable using the keyboard').toBeFocused();
}

test('adds from the keyboard, announces the confirmed item, and opens the persisted cart', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true })).toBeVisible();
  await expect(page.getByText('Desk Mat added to your cart.', { exact: true })).toHaveCount(0);

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  const add = page.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true });
  await tabTo(page, add);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Desk Mat added to your cart.');
  await expect(page.getByRole('link', { name: 'Cart 1 item', exact: true })).toBeVisible();

  const viewCart = page.getByRole('link', { name: 'View cart', exact: true });
  await tabTo(page, viewCart);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/cart');
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Subtotal: $34.00', { exact: true })).toBeVisible();
});
