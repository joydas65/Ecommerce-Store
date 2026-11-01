/** @jest-environment node */

import { createPersistentDemoCommerce, PENDING_ORDER_KEY } from './persistent-demo';

const quoteId = 'quote_12345678-1234-4123-8123-123456789012';
const orderId = 'order_12345678-1234-4123-8123-123456789012';
const anotherQuoteId = 'quote_87654321-1234-4123-8123-123456789012';
const orderInput = {
  customer: { firstname: 'Alex', lastname: 'Example', email: 'demo@example.com' },
  shipping: { name: 'Alex Example', street: '123 Sample Street', town_city: 'San Francisco', county_state: 'CA', postal_zip_code: '94103', country: 'US' },
  fulfillment: { shipping_method: 'demo-standard' },
  payment: { gateway: 'demo', demo: {} },
};

function quoteFixture(unitPriceCents = 1200) {
  const shippingCents = 500;
  const taxCents = Math.round((unitPriceCents + shippingCents) * 8 / 100);
  return {
    id: quoteId, expiresAt: '2035-01-01T12:15:00Z', currency: 'USD', pricingVersion: 'demo-v1',
    items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 1, unitPriceCents, lineTotalCents: unitPriceCents }],
    shippingMethod: 'demo-standard', shippingCents, subtotalCents: unitPriceCents,
    taxCents, totalCents: unitPriceCents + shippingCents + taxCents,
  };
}

function receiptFixture(quote = quoteFixture()) {
  return {
    ...quote, id: orderId, quoteId: quote.id, reference: 'DEMO-12345678',
    status: 'CONFIRMED', paymentStatus: 'SIMULATED',
    createdAt: '2035-01-01T12:00:00Z', expiresAt: '2035-01-31T12:00:00Z',
  };
}

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

function storageFixture() {
  const data = new Map();
  return {
    data,
    getItem: jest.fn((key) => data.get(key) ?? null),
    setItem: jest.fn((key, value) => data.set(key, value)),
    removeItem: jest.fn((key) => data.delete(key)),
  };
}

function lockManagerFixture() {
  let tail = Promise.resolve();
  return { request: jest.fn((name, options, operation) => {
    expect(name).toBe(PENDING_ORDER_KEY);
    expect(options).toEqual({ mode: 'exclusive' });
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }) };
}

function harness({ storage = storageFixture(), lockManager = lockManagerFixture(), quote = quoteFixture(), submit = () => jsonResponse(receiptFixture(quote)) } = {}) {
  const fetchImpl = jest.fn(async (path, options) => {
    if (path === '/api/checkout/quotes') return jsonResponse(quote);
    if (path === '/api/orders') return submit(options);
    throw new Error(`Unexpected request: ${path}`);
  });
  const client = createPersistentDemoCommerce({ storage, fetchImpl, delayMs: 0, lockManager });
  return { client, storage, fetchImpl, lockManager };
}

async function prepare(client) {
  const { cart } = await client.cart.add('demo-notebook', 1);
  const token = await client.checkout.generateToken(cart.id, { type: 'cart' });
  await client.checkout.checkShippingOption(token.id, { shipping_option_id: 'demo-standard', country: 'US', region: 'CA' });
  const total = await client.checkout.setTaxZone(token.id, { country: 'US', region: 'CA', postal_zip_code: '94103' });
  return { token, total };
}

test('uses authoritative quote prices, saves recovery before submitting, and sends no client prices or personal details', async () => {
  const storage = storageFixture();
  const quote = quoteFixture(1500); // Server price intentionally differs from the local $12 preview.
  const { client, fetchImpl } = harness({ storage, quote, submit: (options) => {
    const saved = JSON.parse(storage.getItem(PENDING_ORDER_KEY));
    expect(saved).toMatchObject({ version: 1, quoteId, key: options.headers['Idempotency-Key'] });
    expect(Object.keys(saved).sort()).toEqual(['cart', 'key', 'quoteId', 'version']);
    expect(Object.keys(saved.cart).sort()).toEqual(['id', 'revision']);
    return jsonResponse(receiptFixture(quote));
  } });
  const { token, total } = await prepare(client);
  expect(total.live.subtotal.raw).toBe(15);
  expect(total.live.total_with_tax.raw).toBe(21.6);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
    items: [{ productId: 'demo-notebook', quantity: 1 }],
    shippingMethod: 'demo-standard', destination: { country: 'US', region: 'CA' },
  });

  const receipt = await client.checkout.capture(token.id, orderInput);
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ quoteId });
  expect(fetchImpl.mock.calls[1][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  expect(JSON.stringify(fetchImpl.mock.calls)).not.toMatch(/demo@example\.com|123 Sample Street|94103|Alex|unitPriceCents|totalCents/);
  expect(receipt).toMatchObject({ id: orderId, status_payment: 'simulated', persistent: true, demo: true, receipt_url: `/orders/${orderId}` });
  expect(receipt.live.total_with_tax.raw).toBe(21.6);
  expect((await client.cart.retrieve()).total_items).toBe(0);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
});

test('waits for confirmation and preserves the cart and recovery record when the response rejects', async () => {
  let rejectCapture;
  const { client, storage } = harness({ submit: () => new Promise((resolve, reject) => { rejectCapture = reject; }) });
  const { token } = await prepare(client);
  const before = await client.cart.retrieve();
  let settled = false;
  const capture = client.checkout.capture(token.id, orderInput).finally(() => { settled = true; });
  const rejected = expect(capture).rejects.toThrow(/may already be saved/);

  expect(settled).toBe(false);
  expect(await client.cart.retrieve()).toEqual(before);
  expect(JSON.parse(storage.getItem(PENDING_ORDER_KEY)).quoteId).toBe(quoteId);
  rejectCapture(new Error('Connection lost'));
  await rejected;
  expect(await client.cart.retrieve()).toEqual(before);
  expect(await client.checkout.pending()).toMatchObject({ quoteId });
});

test('replays the same key and returns one committed order after a lost response and adapter reload', async () => {
  const ordersByKey = new Map();
  let loseResponse = true;
  const { client, storage, fetchImpl, lockManager } = harness({ submit: (options) => {
    const key = options.headers['Idempotency-Key'];
    if (!ordersByKey.has(key)) ordersByKey.set(key, receiptFixture());
    if (loseResponse) {
      loseResponse = false;
      throw new Error('Response lost after commit');
    }
    return jsonResponse(ordersByKey.get(key));
  } });
  const { token } = await prepare(client);
  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow(/recover the same order/);
  const savedAttempt = storage.getItem(PENDING_ORDER_KEY);
  const restarted = createPersistentDemoCommerce({ storage, fetchImpl, delayMs: 0, lockManager });
  const receipt = await restarted.checkout.recover();
  const submits = fetchImpl.mock.calls.filter(([path]) => path === '/api/orders');

  expect(submits).toHaveLength(2);
  expect(submits[1][1].headers['Idempotency-Key']).toBe(submits[0][1].headers['Idempotency-Key']);
  expect(submits[1][1].body).toBe(submits[0][1].body);
  expect(ordersByKey.size).toBe(1);
  expect(receipt.id).toBe(orderId);
  expect(savedAttempt).not.toMatch(/Alex|demo@example\.com|94103|123 Sample Street/);
  expect((await restarted.cart.retrieve()).total_items).toBe(0);
  expect(await restarted.checkout.pending()).toBeNull();
});

test.each(['throws', 'silently discards'])('does not submit an order when recovery storage %s', async (behavior) => {
  const { client, storage, fetchImpl } = harness();
  const { token } = await prepare(client);
  const before = await client.cart.retrieve();
  storage.setItem.mockImplementation((key, value) => {
    if (key === PENDING_ORDER_KEY) {
      if (behavior === 'throws') throw new Error('Storage full');
      return;
    }
    storage.data.set(key, value);
  });

  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow(/No order was submitted/);
  expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual(['/api/checkout/quotes']);
  expect(await client.cart.retrieve()).toEqual(before);
});

test.each([
  ['malformed totals', { ...receiptFixture(), totalCents: 1 }],
  ['a different quote', { ...receiptFixture(), quoteId: anotherQuoteId }],
])('retains the cart and recovery key when confirmation has %s', async (label, receipt) => {
  const { client, storage } = harness({ submit: () => jsonResponse(receipt) });
  const { token } = await prepare(client);
  const before = await client.cart.retrieve();
  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow(/valid receipt/);
  const pending = storage.getItem(PENDING_ORDER_KEY);
  await expect(client.checkout.recover()).rejects.toThrow(/valid receipt/);
  expect(await client.cart.retrieve()).toEqual(before);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBe(pending);
});

test('keeps a changed cart when an earlier snapshot finishes saving', async () => {
  let resolveCapture;
  const started = Promise.withResolvers();
  const { client, storage } = harness({ submit: () => new Promise((resolve) => { resolveCapture = resolve; started.resolve(); }) });
  const { token } = await prepare(client);
  const capture = client.checkout.capture(token.id, orderInput);
  await started.promise;
  const { cart: changed } = await client.cart.add('demo-bottle', 1);
  resolveCapture(jsonResponse(receiptFixture()));

  const receipt = await capture;
  expect(receipt.id).toBe(orderId);
  expect(receipt.cart).toEqual(changed);
  expect(await client.cart.retrieve()).toEqual(changed);
  expect(changed.total_items).toBe(2);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
});

test('simulates failure before order submission and permits a successful retry', async () => {
  const { client, storage, fetchImpl } = harness();
  const { token } = await prepare(client);
  const input = { ...orderInput, payment: { gateway: 'demo', demo: { failOnce: true } } };
  await expect(client.checkout.capture(token.id, input)).rejects.toThrow(/Simulated payment failure/);
  expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual(['/api/checkout/quotes']);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
  expect((await client.cart.retrieve()).total_items).toBe(1);

  await expect(client.checkout.capture(token.id, input)).resolves.toMatchObject({ id: orderId });
  expect((await client.cart.retrieve()).total_items).toBe(0);
});

test('clears a definitively expired quote attempt while preserving the cart for a new review', async () => {
  const { client, storage } = harness({ submit: () => jsonResponse({ error: { code: 'QUOTE_EXPIRED', message: 'Your quote expired. Review the order again.' } }, 409) });
  const { token } = await prepare(client);
  const before = await client.cart.retrieve();
  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow(/quote expired/);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
  expect(await client.cart.retrieve()).toEqual(before);
});

test.each(['corrupt', 'unavailable'])('fails closed when an earlier anonymous attempt is %s', async (condition) => {
  const { client, storage, fetchImpl } = harness();
  const { token } = await prepare(client);
  if (condition === 'corrupt') storage.setItem(PENDING_ORDER_KEY, '{invalid json');
  else storage.getItem.mockImplementation((key) => {
    if (key === PENDING_ORDER_KEY) throw new Error('Storage denied');
    return storage.data.get(key) ?? null;
  });

  expect(await client.checkout.pending()).toMatchObject({ unreadable: true, message: expect.any(String) });
  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow();
  await expect(client.checkout.recover()).rejects.toThrow();
  expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual(['/api/checkout/quotes']);
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test('retains an ambiguous attempt when a changed guest identity makes its quote unavailable', async () => {
  const { client, storage, fetchImpl } = harness({ submit: () => jsonResponse({ error: {
    code: 'QUOTE_NOT_FOUND', message: 'This checkout quote is unavailable.',
  } }, 404) });
  const { token } = await prepare(client);
  const before = await client.cart.retrieve();

  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow(/quote is unavailable/);
  const pending = storage.getItem(PENDING_ORDER_KEY);
  expect(pending).not.toBeNull();
  await expect(client.checkout.recover()).rejects.toThrow(/quote is unavailable/);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBe(pending);
  expect(await client.cart.retrieve()).toEqual(before);
  const submissions = fetchImpl.mock.calls.filter(([path]) => path === '/api/orders');
  expect(submissions[1][1].headers['Idempotency-Key']).toBe(submissions[0][1].headers['Idempotency-Key']);
});

test.each(['confirmed', 'expired'])('an older %s response cannot delete a replacement recovery record', async (outcome) => {
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  const { client, storage } = harness({ submit: () => { started.resolve(); return response.promise; } });
  const { token } = await prepare(client);
  const capture = client.checkout.capture(token.id, orderInput);
  await started.promise;
  const { cart: changed } = await client.cart.add('demo-bottle', 1);
  // A tab running an older deployment does not participate in the new lock.
  // Even its replacement record must survive this delayed response.
  const replacement = { version: 1, key: crypto.randomUUID(), quoteId: anotherQuoteId,
    cart: { id: changed.id, revision: client.demo.snapshot().revision } };
  storage.setItem(PENDING_ORDER_KEY, JSON.stringify(replacement));

  if (outcome === 'confirmed') {
    response.resolve(jsonResponse(receiptFixture()));
    await expect(capture).resolves.toMatchObject({ id: orderId });
  } else {
    const rejected = expect(capture).rejects.toThrow(/quote expired/);
    response.resolve(jsonResponse({ error: { code: 'QUOTE_EXPIRED', message: 'Your quote expired.' } }, 410));
    await rejected;
  }
  expect(JSON.parse(storage.getItem(PENDING_ORDER_KEY))).toEqual(replacement);
  expect(await client.cart.retrieve()).toEqual(changed);
});

test('serializes recovery across adapter instances and rereads the pending key after acquiring the lock', async () => {
  const started = Promise.withResolvers();
  const firstResponse = Promise.withResolvers();
  let submissions = 0;
  const { client, storage, fetchImpl, lockManager } = harness({ submit: () => {
    submissions += 1;
    if (submissions === 1) { started.resolve(); return firstResponse.promise; }
    return jsonResponse(receiptFixture());
  } });
  const secondTab = createPersistentDemoCommerce({ storage, fetchImpl, lockManager, delayMs: 0 });
  const { token } = await prepare(client);
  const first = client.checkout.capture(token.id, orderInput);
  const rejected = expect(first).rejects.toThrow(/may already be saved/);
  await started.promise;
  const pending = JSON.parse(storage.getItem(PENDING_ORDER_KEY));
  const recovery = secondTab.checkout.recover();
  await Promise.resolve();
  expect(submissions).toBe(1);
  expect(JSON.parse(storage.getItem(PENDING_ORDER_KEY))).toEqual(pending);

  firstResponse.reject(new Error('Response lost after commit'));
  await rejected;
  await expect(recovery).resolves.toMatchObject({ id: orderId });
  const calls = fetchImpl.mock.calls.filter(([path]) => path === '/api/orders');
  expect(calls).toHaveLength(2);
  expect(calls[0][1].headers['Idempotency-Key']).toBe(pending.key);
  expect(calls[1][1].headers['Idempotency-Key']).toBe(pending.key);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
});

test('a queued second purchase rechecks its cart after the first tab completes', async () => {
  const storage = storageFixture();
  const lockManager = lockManagerFixture();
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  const first = harness({ storage, lockManager, submit: () => { started.resolve(); return response.promise; } });
  const second = harness({ storage, lockManager, quote: { ...quoteFixture(), id: anotherQuoteId } });
  const { token } = await prepare(first.client);
  const cart = await second.client.cart.retrieve();
  const otherToken = await second.client.checkout.generateToken(cart.id, { type: 'cart' });
  await second.client.checkout.checkShippingOption(otherToken.id, { shipping_option_id: 'demo-standard', country: 'US', region: 'CA' });
  await second.client.checkout.setTaxZone(otherToken.id, { country: 'US', region: 'CA', postal_zip_code: '94103' });

  const capture = first.client.checkout.capture(token.id, orderInput);
  await started.promise;
  const otherCapture = second.client.checkout.capture(otherToken.id, orderInput);
  const rejected = expect(otherCapture).rejects.toThrow(/Your cart changed/);
  await Promise.resolve();
  expect(second.fetchImpl.mock.calls.filter(([path]) => path === '/api/orders')).toHaveLength(0);
  response.resolve(jsonResponse(receiptFixture()));
  await capture;
  await rejected;
  expect(second.fetchImpl.mock.calls.filter(([path]) => path === '/api/orders')).toHaveLength(0);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
});

test.each(['unsupported', 'denied'])('fails before submitting or changing recovery data when browser locks are %s', async (condition) => {
  const lockManager = condition === 'unsupported' ? null : { request: jest.fn().mockRejectedValue(new Error('SecurityError')) };
  const { client, storage, fetchImpl } = harness({ lockManager });
  const { token } = await prepare(client);
  const before = await client.cart.retrieve();
  await expect(client.checkout.capture(token.id, orderInput)).rejects.toThrow(/coordinate checkout/);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBeNull();
  const pending = JSON.stringify({ version: 1, quoteId, key: crypto.randomUUID(), cart: { id: before.id, revision: 1 } });
  storage.setItem(PENDING_ORDER_KEY, pending);
  await expect(client.checkout.recover()).rejects.toThrow(/coordinate checkout/);
  expect(storage.getItem(PENDING_ORDER_KEY)).toBe(pending);
  expect(await client.cart.retrieve()).toEqual(before);
  expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual(['/api/checkout/quotes']);
});
