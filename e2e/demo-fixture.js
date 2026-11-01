import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  browserHealth: [async ({ context, page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    const errors = [];
    const externalRequests = [];
    const observe = (tab) => {
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => {
        if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) {
          errors.push(message.text());
        }
      });
    };
    observe(page);
    context.on('page', observe);
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) externalRequests.push(request.url());
    });

    // Check the deployed build is explicitly a demo before any cart/order action.
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
    await expect(page.getByRole('note')).toContainText('Demo store.');
    await expect(page.getByRole('note')).toContainText('No payment is collected');
    await use();
    expect(errors, 'Browser and hydration errors').toEqual([]);
    expect(externalRequests, 'Demo must not request external services or assets').toEqual([]);
  }, { auto: true }],
});

export { expect };
