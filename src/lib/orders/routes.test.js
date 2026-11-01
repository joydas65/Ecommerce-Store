/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });

let mockPersistentOrders = true;
jest.mock('../storefront-config', () => ({ get usesPersistentOrders() { return mockPersistentOrders; } }));

import { POST as quote } from '../../app/api/checkout/quotes/route';
import { POST as order } from '../../app/api/orders/route';
import { GET as receipt } from '../../app/api/orders/[id]/route';
import { POST as legacyQuote } from '../../app/api/demo/quotes/route';
import { POST as legacyOrder } from '../../app/api/demo/orders/route';
import { GET as legacyReceipt } from '../../app/api/demo/orders/[id]/route';
import { POST as paymentSession } from '../../app/api/payment-sessions/route';
import { POST as reconcile } from '../../app/api/orders/[id]/reconcile/route';
import { POST as cancel } from '../../app/api/orders/[id]/cancel/route';

const originalEnv = process.env;
const originalFetch = global.fetch;
const guest = '6af35893-fbd9-489a-b149-1df47299cda9';
const key = '340e7fe9-bd09-4dd9-8d63-3cef741b7ad2';
const secret = 'local-orders-test-secret-at-least-32-characters';
const orderId = `order_${guest}`;
const quoteBody = { items: [{ productId: 'demo-desk-mat', quantity: 1 }],
  shippingMethod: 'demo-standard', destination: { country: 'US', region: 'CA' } };

function request(path, { method = 'POST', body = quoteBody, origin = 'https://store.example',
  cookie = `joys_order_guest=${guest}`, idempotencyKey } = {}) {
  return new Request(`https://store.example${path}`, { method,
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  mockPersistentOrders = true;
  process.env = { ...originalEnv, ORDERS_API_URL: 'http://127.0.0.1:4100',
    ORDERS_ALLOW_LOCAL_API: 'true', ORDERS_API_SECRET: secret };
  delete process.env.VERCEL;
  global.fetch = jest.fn();
});
afterEach(() => { process.env = originalEnv; global.fetch = originalFetch; });

const routes = [
  { name: 'canonical', quote, order, receipt, quotePath: '/api/checkout/quotes', orderPath: '/api/orders' },
  { name: 'compatibility', quote: legacyQuote, order: legacyOrder, receipt: legacyReceipt,
    quotePath: '/api/demo/quotes', orderPath: '/api/demo/orders' },
];

test('Stripe session creation requires a durable idempotency key and forwards only authenticated guest context', async () => {
  const body = { quoteId: `quote_${guest}` };
  const missing = await paymentSession(request('/api/payment-sessions', { body }));
  expect(missing.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
  global.fetch.mockResolvedValue(Response.json({ order: { id: orderId }, checkoutUrl: null }, { status: 201 }));
  const incoming = request('/api/payment-sessions', { body, idempotencyKey: key });
  incoming.headers.set('Authorization', 'Bearer caller-token');
  incoming.headers.set('x-guest-id', 'another-guest');
  const response = await paymentSession(incoming);
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4100/v1/payment-sessions', expect.objectContaining({
    body: JSON.stringify(body), headers: expect.objectContaining({ Authorization: `Bearer ${secret}`, 'x-guest-id': guest, 'idempotency-key': key }),
  }));
});

describe.each([['reconcile', reconcile], ['cancel', cancel]])('Stripe %s route', (action, route) => {
  test('requires the original guest and same origin without creating a new browser identity', async () => {
    const params = { params: Promise.resolve({ id: orderId }) };
    expect((await route(request(`/api/orders/${orderId}/${action}`, { body: {}, cookie: null }), params)).status).toBe(404);
    expect((await route(request(`/api/orders/${orderId}/${action}`, { body: {}, origin: 'https://attacker.example' }), params)).status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch.mockResolvedValue(Response.json({ order: { id: orderId }, checkoutUrl: null }));
    const response = await route(request(`/api/orders/${orderId}/${action}`, { body: {} }), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch).toHaveBeenCalledWith(`http://127.0.0.1:4100/v1/orders/${orderId}/${action}`, expect.objectContaining({
      method: 'POST', body: '{}', headers: expect.objectContaining({ 'x-guest-id': guest, Authorization: `Bearer ${secret}` }),
    }));
  });
  test('rejects invalid IDs before any service call', async () => {
    const response = await route(request('/api/orders/bad'), { params: Promise.resolve({ id: '../payment-sessions' }) });
    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe.each(routes)('$name order routes', (route) => {
  test('quote creation preserves the existing guest and server-only authentication', async () => {
    global.fetch.mockResolvedValue(Response.json({ id: `quote_${guest}` }, { status: 201 }));
    const response = await route.quote(request(route.quotePath));
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain(`joys_order_guest=${guest};`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4100/v1/checkout-quotes', expect.objectContaining({
      method: 'POST', body: JSON.stringify(quoteBody), redirect: 'error', cache: 'no-store',
      headers: expect.objectContaining({ 'x-guest-id': guest, Authorization: `Bearer ${secret}` }),
    }));
  });

  test('a cross-origin quote fails before creating a guest or contacting the backend', async () => {
    const response = await route.quote(request(route.quotePath, { cookie: null, origin: 'https://attacker.example' }));
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('submission keeps the same guest and idempotency key for browser recovery', async () => {
    global.fetch.mockResolvedValue(Response.json({ id: orderId }, { status: 201 }));
    const body = { quoteId: `quote_${guest}` };
    const response = await route.order(request(route.orderPath, { body, idempotencyKey: key }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: orderId });
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:4100/v1/orders', expect.objectContaining({
      body: JSON.stringify(body),
      headers: expect.objectContaining({ 'x-guest-id': guest, 'idempotency-key': key }),
    }));
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('submission without a recovery key never reaches the backend', async () => {
    const response = await route.order(request(route.orderPath, { body: { quoteId: `quote_${guest}` } }));
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('receipt reads await route params and retain the guest-scoped no-store boundary', async () => {
    global.fetch.mockResolvedValue(Response.json({ id: orderId }));
    const response = await route.receipt(request(`${route.orderPath}/${orderId}`, { method: 'GET' }),
      { params: Promise.resolve({ id: orderId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(global.fetch).toHaveBeenCalledWith(`http://127.0.0.1:4100/v1/orders/${orderId}`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ 'x-guest-id': guest }), cache: 'no-store',
    }));
  });

  test.each(['not-an-order', '../checkout-quotes', `${orderId}?guest=other`, `${orderId}/extra`])('invalid receipt IDs never reach the backend: %s', async (id) => {
    const response = await route.receipt(request(route.orderPath, { method: 'GET' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('receipt access without the original guest is unavailable', async () => {
    const response = await route.receipt(request(`${route.orderPath}/${orderId}`, { method: 'GET', cookie: null }),
      { params: Promise.resolve({ id: orderId }) });
    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('disabled persistence returns a neutral error without contacting the service', async () => {
    mockPersistentOrders = false;
    const response = await route.quote(request(route.quotePath));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'ORDERS_DISABLED', message: 'Persistent orders are not enabled in this environment.' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
