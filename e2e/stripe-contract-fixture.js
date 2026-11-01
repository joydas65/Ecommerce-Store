import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';

// Browser contract tests only: these responses model the BFF contract. They do
// not call Stripe or claim database/payment integration coverage. The separate
// persistent simulation suite and backend integration tests cover those layers.
export const test = base.extend({
  stripeContract: [async ({ context, page, baseURL }, use) => {
    if (process.env.E2E_BASE_URL || process.env.E2E_DEPLOYED) {
      throw new Error('Stripe contract fixtures may only run against a local build.');
    }
    const origin = new URL(baseURL).origin;
    const quotes = new Map();
    const orders = new Map();
    const attempts = new Map();
    const submissions = [];
    const unexpectedRequests = [];
    const errors = [];
    let loseNextSubmissionResponse = false;
    const guestFrom = (request) => request.headers().cookie?.match(/(?:^|;\s*)joys_order_guest=([\da-f-]+)/i)?.[1];
    const checkoutUrl = (order) => order.status === 'PENDING_PAYMENT'
      ? `https://checkout.stripe.com/c/pay/cs_test_contract_${order.id}` : null;
    const envelope = (order) => ({ order, checkoutUrl: checkoutUrl(order) });
    const reply = (route, status, body, headers = {}) => route.fulfill({ status, json: body,
      headers: { 'cache-control': 'private, no-store', ...headers } });
    const observe = (tab) => {
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => {
        if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) errors.push(message.text());
      });
    };
    observe(page);
    context.on('page', observe);

    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === 'https://checkout.stripe.com') {
        const id = url.pathname.match(/^\/c\/pay\/cs_test_contract_(order_[\da-f-]+)$/)?.[1];
        const stored = orders.get(id);
        if (!stored) {
          unexpectedRequests.push(url.origin + url.pathname);
          return route.abort();
        }
        const action = url.searchParams.get('fixture');
        if (action) {
          if (action === 'paid') Object.assign(stored.order, { status: 'CONFIRMED', paymentStatus: 'PAID' });
          if (action === 'review') Object.assign(stored.order, { status: 'PAYMENT_REVIEW', paymentStatus: 'REQUIRES_REVIEW' });
          return route.fulfill({ status: 302, headers: { location: `${origin}/orders/${id}?checkout=return` } });
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>Hosted checkout contract fixture</title><main>
          <h1>Hosted checkout contract fixture</h1><p>No request reaches Stripe and no payment is processed.</p>
          <a href="${url.pathname}?fixture=return">Return without payment</a>
          <a href="${url.pathname}?fixture=paid">Confirm test payment fixture</a>
          <a href="${url.pathname}?fixture=review">Flag payment review fixture</a>
          </main></html>` });
      }
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
        unexpectedRequests.push(url.origin + url.pathname);
        return route.abort();
      }
      if (url.pathname === '/api/checkout/quotes' && request.method() === 'POST') {
        const input = request.postDataJSON();
        expect(input).toEqual({ items: [{ productId: 'demo-notebook', quantity: 1 }],
          shippingMethod: 'demo-standard', destination: { country: 'US', region: 'CA' }, paymentProvider: 'stripe-test' });
        const guest = guestFrom(request) || randomUUID();
        const quote = { id: `quote_${randomUUID()}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          currency: 'USD', items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 1, unitPriceCents: 1200, lineTotalCents: 1200 }],
          shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 1200, taxCents: 136, totalCents: 1836,
          pricingVersion: 'demo-v1', paymentProvider: 'stripe-test' };
        quotes.set(quote.id, { quote, guest });
        return reply(route, 201, quote, { 'set-cookie': `joys_order_guest=${guest}; Path=/; HttpOnly; SameSite=Lax` });
      }
      if (url.pathname === '/api/payment-sessions' && request.method() === 'POST') {
        const body = request.postDataJSON();
        const key = request.headers()['idempotency-key'];
        expect(Object.keys(body)).toEqual(['quoteId']);
        expect(key).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i);
        submissions.push({ body, key });
        const storedQuote = quotes.get(body.quoteId);
        if (!storedQuote || storedQuote.guest !== guestFrom(request)) return reply(route, 404, { error: { code: 'QUOTE_NOT_FOUND', message: 'Quote unavailable.' } });
        const attemptKey = `${storedQuote.guest}:${key}`;
        let stored = attempts.get(attemptKey);
        const replayed = !!stored;
        if (!stored) {
          const id = `order_${randomUUID()}`;
          const order = { ...storedQuote.quote, id, quoteId: body.quoteId, reference: `TEST-${id.slice(6).toUpperCase()}`,
            status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paymentProvider: 'stripe-test', paymentMode: 'test',
            createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() };
          stored = { order, guest: storedQuote.guest };
          orders.set(id, stored);
          attempts.set(attemptKey, stored);
        }
        if (loseNextSubmissionResponse) {
          loseNextSubmissionResponse = false;
          return route.abort('failed');
        }
        return reply(route, replayed ? 200 : 201, envelope(stored.order));
      }
      const receipt = url.pathname.match(/^\/api\/orders\/(order_[\da-f-]+)(?:\/(reconcile|cancel))?$/);
      if (receipt) {
        const stored = orders.get(receipt[1]);
        if (!stored || stored.guest !== guestFrom(request)) return reply(route, 404, { error: { code: 'ORDER_NOT_FOUND', message: 'Order unavailable.' } });
        if (request.method() === 'GET' && !receipt[2]) return reply(route, 200, stored.order);
        if (request.method() === 'POST' && receipt[2]) {
          if (receipt[2] === 'cancel' && stored.order.status === 'PENDING_PAYMENT') {
            Object.assign(stored.order, { status: 'CANCELED', paymentStatus: 'CANCELED' });
          }
          return reply(route, 200, envelope(stored.order));
        }
      }
      return route.continue();
    });

    await page.goto('/');
    await expect(page.getByRole('note')).toContainText('Stripe test checkout');
    await expect(page.getByRole('note')).toContainText('No real money');
    await use({ submissions, orders,
      loseNextSubmissionResponse: () => { loseNextSubmissionResponse = true; } });
    expect(errors, 'Browser and hydration errors').toEqual([]);
    expect(unexpectedRequests, 'Contract tests must not contact external providers').toEqual([]);
  }, { auto: true }],
});

export { expect };
