/** @jest-environment node */
import { createStripeCheckoutCommerce, STRIPE_PENDING_KEY } from './stripe-checkout';
import { PENDING_ORDER_KEY } from './persistent-demo';

const quoteId = 'quote_12345678-1234-4123-8123-123456789012';
const orderId = 'order_12345678-1234-4123-8123-123456789012';
const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_fixture';
const quote = {
  id: quoteId, paymentProvider: 'stripe-test', expiresAt: '2035-01-01T12:15:00Z', currency: 'USD', pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 1, unitPriceCents: 1500, lineTotalCents: 1500 }],
  shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 1500, taxCents: 160, totalCents: 2160,
};
const statuses = { PENDING_PAYMENT: 'PENDING', CONFIRMED: 'PAID', CANCELED: 'CANCELED', PAYMENT_REVIEW: 'REQUIRES_REVIEW' };
const order = (status = 'PENDING_PAYMENT') => ({ ...quote, id: orderId, quoteId, reference: 'TEST-12345678', paymentMode: 'test',
  status, paymentStatus: statuses[status], createdAt: '2035-01-01T12:00:00Z', expiresAt: '2035-01-31T12:00:00Z' });
const envelope = (status = 'PENDING_PAYMENT') => ({ order: order(status), checkoutUrl: status === 'PENDING_PAYMENT' ? checkoutUrl : null });
const json = (value, status = 200) => Response.json(value, { status });
const storageFixture = () => {
  const data = new Map();
  return { getItem: jest.fn((key) => data.get(key) ?? null), setItem: jest.fn((key, value) => data.set(key, value)), removeItem: jest.fn((key) => data.delete(key)) };
};
const lockFixture = () => {
  let tail = Promise.resolve();
  return { request: jest.fn((name, options, operation) => {
    expect(name).toBe(PENDING_ORDER_KEY);
    expect(options).toEqual({ mode: 'exclusive' });
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }) };
};
function harness({ storage = storageFixture(), lockManager = lockFixture(), submit = () => json(envelope()), quoted = quote } = {}) {
  const fetchImpl = jest.fn((path, options) => path === '/api/checkout/quotes' ? Promise.resolve(json(quoted)) : submit(options));
  const client = createStripeCheckoutCommerce({ storage, lockManager, fetchImpl, delayMs: 0 });
  return { storage, lockManager, fetchImpl, client };
}
async function prepare(client) {
  const { cart } = await client.cart.add('demo-notebook', 1);
  const token = await client.checkout.generateToken(cart.id, { type: 'cart' });
  await client.checkout.checkShippingOption(token.id, { shipping_option_id: 'demo-standard', country: 'US', region: 'CA' });
  const result = await client.checkout.setTaxZone(token.id, { country: 'US', region: 'CA', postal_zip_code: '94103' });
  return { token, result };
}

test('quotes authoritative Stripe prices and saves only recovery metadata before creating a pending session', async () => {
  const storage = storageFixture();
  const { client, fetchImpl } = harness({ storage, submit: (options) => {
    const saved = JSON.parse(storage.getItem(STRIPE_PENDING_KEY));
    expect(saved).toEqual({ version: 1, paymentProvider: 'stripe-test', quoteId, key: options.headers['Idempotency-Key'], cart: { id: expect.any(String), revision: expect.any(Number) } });
    return json(envelope());
  } });
  const { token, result } = await prepare(client);
  expect(result.live.total_with_tax.raw).toBe(21.6);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ paymentProvider: 'stripe-test',
    items: [{ productId: 'demo-notebook', quantity: 1 }], shippingMethod: 'demo-standard', destination: { country: 'US', region: 'CA' } });
  const before = await client.cart.retrieve();
  await expect(client.checkout.startPayment(token.id)).resolves.toEqual(envelope());
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ quoteId });
  expect(JSON.stringify(fetchImpl.mock.calls)).not.toMatch(/94103|unitPriceCents|totalCents/);
  expect(await client.cart.retrieve()).toEqual(before);
  expect(await client.checkout.pending()).toMatchObject({ orderId, quoteId });
  await expect(client.checkout.capture(token.id, {})).rejects.toThrow('Continue to Stripe');
});

test('replays a lost session response with the same persisted key after reload', async () => {
  let first = true;
  const { client, storage, fetchImpl, lockManager } = harness({ submit: () => {
    if (first) { first = false; throw new Error('Response lost after session creation'); }
    return json(envelope());
  } });
  const { token } = await prepare(client);
  await expect(client.checkout.startPayment(token.id)).rejects.toThrow('Resume the saved checkout');
  const saved = JSON.parse(storage.getItem(STRIPE_PENDING_KEY));
  const reloaded = createStripeCheckoutCommerce({ storage, fetchImpl, lockManager, delayMs: 0 });
  await expect(reloaded.checkout.recover()).resolves.toEqual(envelope());
  const submissions = fetchImpl.mock.calls.filter(([path]) => path === '/api/payment-sessions');
  expect(submissions).toHaveLength(2);
  expect(submissions.map(([, options]) => options.headers['Idempotency-Key'])).toEqual([saved.key, saved.key]);
  expect((await reloaded.cart.retrieve()).total_items).toBe(1);
});

test.each(['storage', 'lock', 'corrupt'])('fails closed before payment submission when %s cannot support recovery', async (failure) => {
  const { client, storage, fetchImpl, lockManager } = harness();
  const { token } = await prepare(client);
  if (failure === 'storage') storage.setItem.mockImplementation(() => { throw new Error('Blocked'); });
  if (failure === 'lock') lockManager.request = undefined;
  if (failure === 'corrupt') storage.setItem(STRIPE_PENDING_KEY, '{broken');
  await expect(client.checkout.startPayment(token.id)).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test.each([
  { ...envelope(), checkoutUrl: 'https://checkout.stripe.com.attacker.example/pay' },
  { ...envelope(), order: { ...order(), paymentMode: 'live' } },
  { ...envelope(), order: { ...order(), status: 'CONFIRMED', paymentStatus: 'PENDING' } },
  { ...envelope(), order: { ...order(), quoteId: 'quote_87654321-1234-4123-8123-123456789012' } },
])('rejects malformed or mismatched sessions without discarding recovery or cart (%j)', async (result) => {
  const { client, storage } = harness({ submit: () => json(result) });
  const { token } = await prepare(client);
  await expect(client.checkout.startPayment(token.id)).rejects.toThrow('valid Stripe checkout');
  expect(storage.getItem(STRIPE_PENDING_KEY)).not.toBeNull();
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test('only verified paid orders clear the matching cart, and repeat completion preserves later shopping', async () => {
  const { client, storage } = harness();
  const { token } = await prepare(client);
  await client.checkout.startPayment(token.id);
  await expect(client.checkout.completePayment(order())).rejects.toThrow('has not been confirmed');
  expect((await client.cart.retrieve()).total_items).toBe(1);
  const completed = await client.checkout.completePayment(order('CONFIRMED'));
  expect(completed).toMatchObject({ id: orderId, demo: false, persistent: true, payment_provider: 'stripe-test', payment_mode: 'test', status_payment: 'paid' });
  expect((await client.cart.retrieve()).total_items).toBe(0);
  expect(storage.getItem(STRIPE_PENDING_KEY)).toBeNull();
  await client.cart.add('demo-tote', 1);
  await client.checkout.completePayment(order('CONFIRMED'));
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test('payment completion preserves a changed cart and an unrelated pending order', async () => {
  const { client, storage } = harness();
  const { token } = await prepare(client);
  await client.checkout.startPayment(token.id);
  await client.cart.add('demo-tote', 1);
  await client.checkout.completePayment({ ...order('CONFIRMED'), quoteId: 'quote_87654321-1234-4123-8123-123456789012' });
  expect(storage.getItem(STRIPE_PENDING_KEY)).not.toBeNull();
  await client.checkout.completePayment(order('CONFIRMED'));
  expect((await client.cart.retrieve()).total_items).toBe(2);
  expect(storage.getItem(STRIPE_PENDING_KEY)).toBeNull();
});

test('verified cancellation releases the attempt without clearing cart; review stays unresolved', async () => {
  let result = envelope('PAYMENT_REVIEW');
  const { client, storage } = harness({ submit: () => json(result) });
  const { token } = await prepare(client);
  await expect(client.checkout.startPayment(token.id)).resolves.toEqual(result);
  await expect(client.checkout.releaseCanceledPayment(result.order)).rejects.toThrow('has not been canceled');
  expect(storage.getItem(STRIPE_PENDING_KEY)).not.toBeNull();
  result = envelope('CANCELED');
  await expect(client.checkout.recover()).resolves.toEqual(result);
  expect(storage.getItem(STRIPE_PENDING_KEY)).toBeNull();
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test.each([['QUOTE_NOT_FOUND', true], ['QUOTE_EXPIRED', false]])('%s retains an ambiguous attempt but releases a definitively expired quote', async (code, retains) => {
  const { client, storage } = harness({ submit: () => json({ error: { code, message: 'Quote unavailable' } }, 410) });
  const { token } = await prepare(client);
  await expect(client.checkout.startPayment(token.id)).rejects.toThrow('Quote unavailable');
  expect(storage.getItem(STRIPE_PENDING_KEY) !== null).toBe(retains);
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test('serializes concurrent tabs using the same attempt and refuses stale cart submission', async () => {
  const { client, storage, lockManager, fetchImpl } = harness();
  const { token } = await prepare(client);
  const other = createStripeCheckoutCommerce({ storage, lockManager, fetchImpl, delayMs: 0 });
  await Promise.all([client.checkout.startPayment(token.id), other.checkout.recover()]);
  const submissions = fetchImpl.mock.calls.filter(([path]) => path === '/api/payment-sessions');
  expect(new Set(submissions.map(([, options]) => options.headers['Idempotency-Key'])).size).toBe(1);
  await client.checkout.releaseCanceledPayment(order('CANCELED'));
  await client.cart.add('demo-tote', 1);
  await expect(client.checkout.startPayment(token.id)).rejects.toThrow('Your cart changed');
});
