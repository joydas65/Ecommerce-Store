import { test, expect } from './stripe-contract-fixture';

async function prepareCheckout(page) {
  await page.getByRole('button', { name: 'Add to cart: Notebook', exact: true }).click();
  await page.getByRole('link', { name: /^Cart \d+ items?$/ }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample address', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Stripe test checkout', exact: true })).toBeEnabled();
}

async function enterHostedFixture(page) {
  await page.getByRole('button', { name: 'Continue to Stripe test checkout', exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_contract_/);
  await expect(page.getByRole('heading', { name: 'Hosted checkout contract fixture', exact: true })).toBeVisible();
}

async function expectCartPreserved(context, subtotal = '$12.00') {
  const cart = await context.newPage();
  try {
    await cart.goto('/cart');
    await expect(cart.getByText(`Subtotal: ${subtotal}`, { exact: true })).toBeVisible();
  } finally { await cart.close(); }
}

test('session creation and an unpaid return remain pending and preserve the cart', async ({ page, context, stripeContract }) => {
  await prepareCheckout(page);
  await enterHostedFixture(page);
  expect(stripeContract.orders.size).toBe(1);
  expect([...stripeContract.orders.values()][0].order.paymentStatus).toBe('PENDING');
  await expectCartPreserved(context);
  await page.getByRole('link', { name: 'Return without payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment awaiting confirmation', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Payment awaiting confirmation', exact: true })).toBeVisible();
  await expectCartPreserved(context);
  await page.getByRole('button', { name: 'Resume Stripe checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hosted checkout contract fixture', exact: true })).toBeVisible();
  expect(stripeContract.orders.size).toBe(1);
});

test('only a verified paid receipt clears the purchased cart after hosted checkout', async ({ page, context }) => {
  await prepareCheckout(page);
  await enterHostedFixture(page);
  await expectCartPreserved(context);
  await page.getByRole('link', { name: 'Confirm test payment fixture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toBeVisible();
  await expect(page.getByText(/^Order ref: TEST-/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Order totals' })).toContainText('$18.36');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toBeVisible();
  await page.goto('/cart');
  await expect(page.getByText(/You have no items in your shopping cart/)).toBeVisible();
});

test('reload recovers the same payment session after the creation response disappears', async ({ page, context, stripeContract }) => {
  await prepareCheckout(page);
  stripeContract.loseNextSubmissionResponse();
  await page.getByRole('button', { name: 'Continue to Stripe test checkout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume Stripe checkout', exact: true })).toBeVisible();
  await expectCartPreserved(context);
  await page.reload();
  await page.getByRole('button', { name: 'Resume Stripe checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hosted checkout contract fixture', exact: true })).toBeVisible();
  expect(stripeContract.orders.size).toBe(1);
  expect(stripeContract.submissions.length).toBeGreaterThanOrEqual(2);
  for (const attempt of stripeContract.submissions) expect(attempt).toEqual(stripeContract.submissions[0]);
});

test('canceling an unpaid session preserves the cart and never displays success', async ({ page, context, stripeContract }) => {
  await prepareCheckout(page);
  await enterHostedFixture(page);
  await page.getByRole('link', { name: 'Return without payment', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Checkout canceled', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toHaveCount(0);
  expect([...stripeContract.orders.values()][0].order.paymentStatus).toBe('CANCELED');
  await expectCartPreserved(context);
  await page.getByRole('link', { name: 'Return to checkout', exact: true }).click();
  await expect(page).toHaveURL('/checkout');
});

test('payment review is not confirmation and does not clear the cart', async ({ page, context }) => {
  await prepareCheckout(page);
  await enterHostedFixture(page);
  await page.getByRole('link', { name: 'Flag payment review fixture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment needs review', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toHaveCount(0);
  await expectCartPreserved(context);
});

test('a paid receipt cannot erase cart changes made while hosted checkout is open', async ({ page, context }) => {
  await prepareCheckout(page);
  await enterHostedFixture(page);
  const shopping = await context.newPage();
  await shopping.goto('/');
  await shopping.getByRole('button', { name: 'Add to cart: Bottle', exact: true }).click();
  await expect(shopping.getByRole('link', { name: /^Cart \d+ items?$/ })).toHaveAccessibleName('Cart 2 items');
  await shopping.close();
  await page.getByRole('link', { name: 'Confirm test payment fixture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stripe test order complete', exact: true })).toBeVisible();
  await expectCartPreserved(context, '$40.00');
});
