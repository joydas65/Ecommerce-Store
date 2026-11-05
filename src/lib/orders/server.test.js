/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });

import { forwardOrderRequest, orderApiConfig } from './server';

let mockPersistentMode = true;
jest.mock('../storefront-config', () => ({ get usesPersistentOrders() { return mockPersistentMode; } }));

const originalEnv = process.env;
const guest = '6af35893-fbd9-489a-b149-1df47299cda9';
const spoofedGuest = '08e70c15-d939-4d3f-91e6-711e6e78de53';
const key = '340e7fe9-bd09-4dd9-8d63-3cef741b7ad2';
const secret = 'local-orders-test-secret-at-least-32-characters';
const cloudURL = 'https://joys-store-orders.vercel.app';
const quoteBody = { items: [{ productId: 'demo-desk-mat', quantity: 1 }], shippingMethod: 'demo-standard', destination: { country: 'US', region: 'CA' } };
const localConfig = { ORDERS_API_URL: 'http://127.0.0.1:4100', ORDERS_ALLOW_LOCAL_API: 'true', ORDERS_API_SECRET: secret };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function request({ method = 'POST', url = 'https://store.example/api/checkout/quotes', body = quoteBody, headers = {} } = {}) {
  return new Request(url, { method, headers: { origin: new URL(url).origin, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}

beforeEach(() => {
  mockPersistentMode = true;
  process.env = { ...originalEnv, ...localConfig };
  delete process.env.VERCEL;
});
afterEach(() => { process.env = originalEnv; });

test('new signed-in orders forward only shopper auth cookies alongside the private guest credential', async () => {
  process.env.CUSTOMER_AUTH_ENABLED = 'true';
  const customer = '__Secure-joys_customer.session_token=customer-signed';
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: 'order_fixture' }, 201));
  const req = request({ headers: { cookie: `joys_order_guest=${guest}; ${customer}; __Secure-joys_merchant.session_token=merchant; tracking=private`, 'idempotency-key': key } });
  expect((await forwardOrderRequest(req, '/v1/orders', { fetchImpl })).status).toBe(201);
  expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ Cookie: customer, 'x-guest-id': guest, Authorization: `Bearer ${secret}` });
  expect(JSON.stringify(fetchImpl.mock.calls[0])).not.toContain('merchant');
});

test('receipt and quote requests do not gain shopper privileges', async () => {
  process.env.CUSTOMER_AUTH_ENABLED = 'true';
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: 'quote_fixture' }, 201));
  const req = request({ headers: { cookie: `joys_order_guest=${guest}; __Secure-joys_customer.session_token=customer-signed` } });
  await forwardOrderRequest(req, '/v1/checkout-quotes', { fetchImpl });
  expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Cookie');
});

test('expired shopper session requires sign-in without silently converting checkout to guest', async () => {
  process.env.CUSTOMER_AUTH_ENABLED = 'true';
  const fetchImpl = jest.fn().mockResolvedValue(reply({ error: { code: 'AUTH_REQUIRED' } }, 401));
  const req = request({ headers: { cookie: `joys_order_guest=${guest}; __Secure-joys_customer.session_token=expired`, 'idempotency-key': key } });
  const response = await forwardOrderRequest(req, '/v1/orders', { fetchImpl });
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('ambiguous shopper session cookies never downgrade checkout to a guest purchase', async () => {
  process.env.CUSTOMER_AUTH_ENABLED = 'true';
  const fetchImpl = jest.fn();
  const req = request({ headers: { cookie: `joys_order_guest=${guest}; joys_customer.session_token=one; joys_customer.session_token=two`, 'idempotency-key': key } });
  expect((await forwardOrderRequest(req, '/v1/orders', { fetchImpl })).status).toBe(401);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('disabled persistent mode never contacts the order service', async () => {
  mockPersistentMode = false;
  const fetchImpl = jest.fn();
  const response = await forwardOrderRequest(request(), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: 'ORDERS_DISABLED' } });
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each(['https://attacker.example', 'null', '', 'not an origin', 'https://store.example/path', 'https://store.example?query=1', 'https://store.example#fragment', 'https://user:pass@store.example'])('rejects POST requests without the exact storefront origin: %p', async (origin) => {
  const fetchImpl = jest.fn();
  const response = await forwardOrderRequest(request({ headers: { origin } }), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(403);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('accepts the actual same-origin Host when Next reconstructs the request URL with localhost', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: 'quote_fixture' }, 201));
  const response = await forwardOrderRequest(request({
    url: 'http://localhost:3100/api/checkout/quotes',
    headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100' },
  }), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(201);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(response.headers.get('set-cookie')).not.toContain('Secure');
});

test.each([
  { host: '127.0.0.1:3100', origin: 'http://attacker.example' },
  { host: '127.0.0.1:3100', origin: 'https://127.0.0.1:3100' },
  { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100/path' },
  { host: '127.0.0.1:3100/path', origin: 'http://127.0.0.1:3100' },
])('rejects cross-site or malformed Host/origin pairs: %j', async (headers) => {
  const fetchImpl = jest.fn();
  const response = await forwardOrderRequest(request({ url: 'http://localhost:3100/api/checkout/quotes', headers }), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(403);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('creates a secure guest cookie and forwards a bounded no-store quote request with its server identity', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: 'quote_fixture' }, 201));
  const response = await forwardOrderRequest(request({ headers: { 'x-guest-id': spoofedGuest, authorization: 'Bearer browser-supplied-credential' } }), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(201);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toMatch(/^joys_order_guest=[0-9a-f-]{36};/);
  for (const attribute of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=2592000']) expect(cookie).toContain(attribute);
  const assignedGuest = cookie.split(';')[0].split('=')[1];
  expect(assignedGuest).not.toBe(spoofedGuest);
  expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4100/v1/checkout-quotes', expect.objectContaining({
    method: 'POST', body: JSON.stringify(quoteBody), headers: expect.objectContaining({ 'Content-Type': 'application/json', 'x-guest-id': assignedGuest }),
    cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal),
  }));
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  expect(new Headers(fetchImpl.mock.calls[0][1].headers).get('authorization')).toBe(`Bearer ${secret}`);
  expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('browser-supplied-credential');
});

test('uses the cookie rather than browser-supplied guest headers and retains that identity across quotes', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: 'quote_fixture' }, 201));
  const response = await forwardOrderRequest(request({ headers: { cookie: `other=abc; joys_order_guest=${guest}`, 'x-guest-id': spoofedGuest } }), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(fetchImpl.mock.calls[0][1].headers['x-guest-id']).toBe(guest);
  expect(response.headers.get('set-cookie')).toContain(`joys_order_guest=${guest};`);
});

test.each([undefined, 'joys_order_guest=invalid'])('receipt reads without a usable cookie stay private: %p', async (cookie) => {
  const fetchImpl = jest.fn();
  const response = await forwardOrderRequest(request({ method: 'GET', headers: cookie ? { cookie, 'x-guest-id': guest } : { 'x-guest-id': guest } }), `/v1/orders/order_${guest}`, { fetchImpl });
  expect(response.status).toBe(404);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(response.headers.get('set-cookie')).toBeNull();
});

test('forwards an owned receipt read without caching or creating another guest identity', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: `order_${guest}` }));
  const response = await forwardOrderRequest(request({ method: 'GET', headers: { cookie: `joys_order_guest=${guest}` } }), `/v1/orders/order_${guest}`, { fetchImpl });
  expect(response.status).toBe(200);
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { 'x-guest-id': guest }, cache: 'no-store', redirect: 'error' });
  expect(fetchImpl.mock.calls[0][1].body).toBeUndefined();
  expect(response.headers.get('set-cookie')).toBeNull();
});

test.each([undefined, 'invalid'])('requires an idempotency key before submitting an order: %p', async (idempotencyKey) => {
  const fetchImpl = jest.fn();
  const headers = { cookie: `joys_order_guest=${guest}`, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) };
  const response = await forwardOrderRequest(request({ body: { quoteId: `quote_${guest}` }, headers }), '/v1/orders', { fetchImpl });
  expect(response.status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('forwards the same valid submission key and preserves a domain conflict without turning it into success', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Conflict' } }, 409));
  const response = await forwardOrderRequest(request({ body: { quoteId: `quote_${guest}` }, headers: { cookie: `joys_order_guest=${guest}`, 'idempotency-key': key } }), '/v1/orders', { fetchImpl });
  expect(response.status).toBe(409);
  expect(fetchImpl.mock.calls[0][1].headers['idempotency-key']).toBe(key);
  expect(await response.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } });
});

test.each([
  { body: 'invalid JSON' },
  { body: { content: 'x'.repeat(16_385) } },
  { body: '{}', headers: { 'content-type': 'text/plain' } },
])('rejects invalid, oversized, or non-JSON bodies before networking: %j', async (options) => {
  const fetchImpl = jest.fn();
  const response = await forwardOrderRequest(request(options), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([401, 403, 500, 503])('fails closed for upstream authentication and service failures: %i', async (status) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ sensitive: 'upstream-internal-detail' }, status));
  const response = await forwardOrderRequest(request(), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('upstream-internal-detail');
  // Retaining the guest identity also makes a quote lost after creation recoverable
  // through the same browser identity rather than silently creating another guest.
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
});

test('fails closed when transport, server credentials, or response parsing fails', async () => {
  for (const fetchImpl of [jest.fn().mockRejectedValue(new Error('private transport failure')), jest.fn().mockResolvedValue(new Response('not JSON'))]) {
    const response = await forwardOrderRequest(request(), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private transport failure');
  }
  process.env.ORDERS_API_URL = cloudURL;
  delete process.env.ORDERS_API_SECRET;
  const fetchImpl = jest.fn();
  const response = await forwardOrderRequest(request(), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(503);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('authenticates the configured HTTPS backend using only the fixed server secret', async () => {
  process.env.ORDERS_API_URL = cloudURL;
  const fetchImpl = jest.fn().mockResolvedValue(reply({ id: 'quote_fixture' }, 201));
  const response = await forwardOrderRequest(request({ headers: { cookie: `joys_order_guest=${guest}`, authorization: 'Bearer attacker-token', 'x-guest-id': spoofedGuest } }), '/v1/checkout-quotes', { createGuest: true, fetchImpl });
  expect(response.status).toBe(201);
  const [target, options] = fetchImpl.mock.calls[0];
  expect(target).toBe(`${cloudURL}/v1/checkout-quotes`);
  expect(new Headers(options.headers).get('authorization')).toBe(`Bearer ${secret}`);
  expect(options.headers['x-guest-id']).toBe(guest);
  expect(JSON.stringify(options)).not.toMatch(/attacker-token|x-amz/);
  expect(response.headers.get('authorization')).toBeNull();
  expect(await response.text()).not.toContain(secret);
});

test('allows loopback only with explicit opt-in outside Vercel', () => {
  expect(orderApiConfig(localConfig)).toEqual({ base: new URL(localConfig.ORDERS_API_URL), secret });
  expect(orderApiConfig({ ...localConfig, ORDERS_API_URL: 'http://localhost:4100' })).toEqual({ base: new URL('http://localhost:4100'), secret });
  for (const config of [
    { ...localConfig, VERCEL: '1' }, { ...localConfig, ORDERS_ALLOW_LOCAL_API: 'false' }, { ...localConfig, ORDERS_ALLOW_LOCAL_API: undefined },
    { ...localConfig, ORDERS_API_URL: 'http://169.254.169.254' }, { ...localConfig, ORDERS_API_URL: 'http://example.com' },
  ]) expect(() => orderApiConfig(config)).toThrow('Order API configuration unavailable');
});

test('requires a Vercel HTTPS backend origin without embedded credentials, path, query, or fragment', () => {
  const config = { ORDERS_API_URL: cloudURL, ORDERS_API_SECRET: secret };
  expect(orderApiConfig(config)).toEqual({ base: new URL(cloudURL), secret });
  for (const invalid of [
    { ...config, ORDERS_API_URL: 'https://attacker.example' }, { ...config, ORDERS_API_URL: `${cloudURL}?x=1` },
    { ...config, ORDERS_API_URL: `${cloudURL}#fragment` }, { ...config, ORDERS_API_URL: cloudURL.replace('https://', 'https://user:pass@') },
    { ...config, ORDERS_API_URL: `${cloudURL}/api` }, { ...config, ORDERS_API_URL: 'http://joys-store-orders.vercel.app' },
    { ...config, ORDERS_API_URL: 'https://joys-store-orders.vercel.app.attacker.example' },
    { ...config, ORDERS_API_URL: 'https://abc123.execute-api.us-east-1.amazonaws.com' },
  ]) expect(() => orderApiConfig(invalid)).toThrow('Order API configuration unavailable');
});

test.each([undefined, '', 'short', 'x'.repeat(31)])('requires a server secret of at least 32 characters in every environment: %p', (invalidSecret) => {
  for (const config of [localConfig, { ORDERS_API_URL: cloudURL }]) {
    expect(() => orderApiConfig({ ...config, ORDERS_API_SECRET: invalidSecret })).toThrow('Order API configuration unavailable');
    expect(orderApiConfig({ ...config, ORDERS_API_SECRET: 'x'.repeat(32) }).secret).toHaveLength(32);
  }
});
