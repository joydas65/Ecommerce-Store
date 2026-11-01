import { test, expect } from './demo-fixture';

async function addProduct(page, name, expectedItems) {
  await page.getByRole('button', { name: `Add ${name} to cart`, exact: true }).click();
  await expect(page.getByRole('link', { name: /^Show cart items/ })).toHaveText(String(expectedItems));
}

async function sampleAddress(page) {
  await page.getByRole('button', { name: 'Use sample address', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue('Alex');
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('demo@example.com');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
}

async function summaryAmount(page, label, amount) {
  await expect(page.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) })).toContainText(amount);
}

test('browses local products, persists a cart, and completes a simulated purchase with shipping and tax', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Add .+ to cart$/ })).toHaveCount(6);
  const productImages = page.getByRole('main').getByRole('img');
  await expect(productImages).toHaveCount(6);
  for (const image of await productImages.all()) {
    await expect(image).toHaveAttribute('src', /^\/demo\//);
    await expect(image).toHaveJSProperty('complete', true);
    await expect(image).not.toHaveJSProperty('naturalWidth', 0);
  }

  await addProduct(page, 'Desk Mat', 1);
  await addProduct(page, 'Notebook', 2);
  await page.getByRole('link', { name: /^Show cart items/ }).click();
  await expect(page.getByText('Subtotal: $46.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Desk Mat quantity', exact: true }).click();
  await expect(page.getByText('Subtotal: $80.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Subtotal: $80.00', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await sampleAddress(page);
  await page.getByRole('combobox', { name: 'Shipping Options', exact: true }).click();
  await page.getByRole('option', { name: /Express.*\$12\.00/i }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await summaryAmount(page, 'Subtotal', '$80.00');
  await summaryAmount(page, 'Shipping', '$12.00');
  await summaryAmount(page, 'Sample tax (8%)', '$7.36');
  await summaryAmount(page, 'Total', '$99.36');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Simulated payment', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Place demo order.*\$99\.36$/ }).click();

  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();
  await expect(page.getByText(/Order ref: DEMO-/)).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
});

test('preserves the cart after a controlled payment failure and allows a successful retry on mobile', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await addProduct(page, 'Notebook', 1);
  await page.getByRole('link', { name: /^Show cart items/ }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await sampleAddress(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await summaryAmount(page, 'Total', '$18.36');
  const summaryHeading = page.getByRole('heading', { name: 'Order summary', exact: true });
  await expect(summaryHeading).toBeFocused();
  const summaryPosition = await summaryHeading.boundingBox();
  expect(summaryPosition.y).toBeGreaterThanOrEqual(56);
  expect(summaryPosition.y + summaryPosition.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

  await page.getByRole('checkbox', { name: 'Simulate a payment failure', exact: true }).check();
  await page.getByRole('button', { name: /^Place demo order/ }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/simulat|demo/i);
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Simulate a payment failure', exact: true })).not.toBeChecked();

  // An independent tab confirms that failure did not just leave an outdated
  // order summary visible while silently clearing the persisted cart.
  const cartTab = await context.newPage();
  await cartTab.goto('/cart');
  await expect(cartTab.getByText('Subtotal: $12.00', { exact: true })).toBeVisible();
  await cartTab.close();

  await page.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();
  await expect(page.getByText(/Order ref: DEMO-/)).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
});

test('handles direct entry to an empty checkout without a loading loop', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page.getByText('Your cart is empty. Add a product to start checkout.', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('link', { name: 'Browse products', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: /^Add .+ to cart$/ })).toHaveCount(6);
});

test('updates a stale checkout after another tab purchases and can start a new order', async ({ page, context }) => {
  await page.goto('/');
  await addProduct(page, 'Notebook', 1);
  await page.getByRole('link', { name: /^Show cart items/ }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await sampleAddress(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await summaryAmount(page, 'Total', '$18.36');

  const secondTab = await context.newPage();
  await secondTab.goto('/checkout');
  await sampleAddress(secondTab);
  await secondTab.getByRole('button', { name: 'Next', exact: true }).click();
  await secondTab.getByRole('button', { name: /^Place demo order.*\$18\.36$/ }).click();
  await expect(secondTab.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();

  await expect(page.getByText('Your cart is empty. Add a product to start checkout.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Browse products', exact: true }).click();
  await addProduct(page, 'Bottle', 1);
  await page.getByRole('link', { name: /^Show cart items/ }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await sampleAddress(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await summaryAmount(page, 'Total', '$35.64');
  await page.getByRole('button', { name: /^Place demo order.*\$35\.64$/ }).click();
  await expect(page.getByRole('heading', { name: 'Demo order complete', exact: true })).toBeVisible();
});
