/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });

import { forwardMerchantAuth, forwardMerchantRequest, merchantConfig, merchantCookies, merchantSession } from './server';

const env = { MERCHANT_AUTH_ENABLED: 'true', MERCHANT_AUTH_ORIGIN: 'https://joys-store.vercel.app', ORDERS_API_URL: 'https://joys-orders.vercel.app' };
const cookie = '__Secure-joys_merchant.session_token=fixture.signed';
const body = { provider: 'github', callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' };
const reply = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const request = (path, { method = 'GET', data, headers = {} } = {}) => new Request(`https://joys-store.vercel.app${path}`, {
  method, headers: { Cookie: cookie, Origin: env.MERCHANT_AUTH_ORIGIN, 'Content-Type': 'application/json', ...headers },
  ...(method === 'POST' ? { body: typeof data === 'string' ? data : JSON.stringify(data || {}) } : {}),
});

test('merchant config requires explicit enabling and bounded fixed origins', () => {
  expect(merchantConfig(env)).toEqual({ base: env.ORDERS_API_URL, origin: env.MERCHANT_AUTH_ORIGIN });
  for (const value of ['', 'https://attacker.example', 'https://user:pass@joys-orders.vercel.app', 'https://joys-orders.vercel.app/extra', 'https://joys-orders.vercel.app?redirect=1', 'https://joys-orders.vercel.app:8443']) {
    expect(() => merchantConfig({ ...env, ORDERS_API_URL: value })).toThrow();
  }
  expect(() => merchantConfig({ ...env, MERCHANT_AUTH_ENABLED: 'false' })).toThrow();
  const local = { ...env, MERCHANT_AUTH_ORIGIN: 'http://127.0.0.1:3100', ORDERS_API_URL: 'http://127.0.0.1:4100', ORDERS_ALLOW_LOCAL_API: 'true' };
  expect(merchantConfig(local).base).toBe('http://127.0.0.1:4100');
  expect(() => merchantConfig({ ...local, VERCEL: '1' })).toThrow();
});

test('forwards only merchant cookies and rejects ambiguous or oversized cookie input', () => {
  expect(merchantCookies(`joys_order_guest=private; ${cookie}; tracking=private`)).toBe(cookie);
  expect(merchantCookies('joys_merchant.oauth_state=abc; joys_merchant.session_token=def')).toBe('joys_merchant.oauth_state=abc; joys_merchant.session_token=def');
  expect(merchantCookies(`${cookie}; ${cookie}`)).toBe('');
  expect(merchantCookies(`${cookie}\r\nX-Forged: yes`)).toBe('');
  expect(merchantCookies('x'.repeat(8193))).toBe('');
});

test('guest cookies, user headers and the checkout service secret cannot authenticate the merchant BFF', async () => {
  const fetchImpl = jest.fn();
  const response = await forwardMerchantRequest(request('/api/merchant/orders', { headers: { Cookie: 'joys_order_guest=some-guest', Authorization: 'Bearer storefront-service-secret', 'x-user-id': 'merchant', 'x-merchant-role': 'merchant' } }), '/v1/merchant/orders', { env, fetchImpl });
  expect(response.status).toBe(401);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('merchant reads are uncached, bounded and never forward supplied authorization or identity headers', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ orders: [], pageInfo: { nextCursor: null, hasMore: false } }));
  const response = await forwardMerchantRequest(request('/api/merchant/orders?status=paid', { headers: { Authorization: 'Bearer forged', 'x-user-id': 'forged', Cookie: `${cookie}; joys_order_guest=private` } }), '/v1/merchant/orders?status=paid', { env, fetchImpl });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  expect(fetchImpl).toHaveBeenCalledWith('https://joys-orders.vercel.app/v1/merchant/orders?status=paid', expect.objectContaining({ headers: { Cookie: cookie }, cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }));
});

test.each([400, 401, 403, 404, 429, 500])('sanitizes upstream errors: %s', async (status) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ sql: 'sensitive backend detail', token: 'secret' }, status));
  const result = await forwardMerchantRequest(request('/api/merchant/orders'), '/v1/merchant/orders', { env, fetchImpl });
  expect(result.status).toBe(status === 500 ? 503 : status);
  expect(await result.text()).not.toMatch(/sensitive|secret/);
});

test('failed or malformed dependencies fail closed instead of granting page access', async () => {
  for (const fetchImpl of [jest.fn().mockRejectedValue(new Error('timeout')), jest.fn().mockResolvedValue(reply({ role: 'guest', user: { id: 'u1' } })), jest.fn().mockResolvedValue(reply({ role: 'merchant' }))]) {
    expect((await merchantSession(cookie, { env, fetchImpl })).status).toBe(503);
  }
  const fetchImpl = jest.fn().mockResolvedValue(reply({ role: 'merchant', user: { id: 'u1' } }));
  expect((await merchantSession(cookie, { env, fetchImpl })).status).toBe(200);
});

test('rejects overlarge upstream responses and write requests', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ content: 'x'.repeat(262145) }));
  expect((await forwardMerchantRequest(request('/api/merchant/orders'), '/v1/merchant/orders', { env, fetchImpl })).status).toBe(503);
  expect((await forwardMerchantRequest(request('/api/merchant/orders', { method: 'POST' }), '/v1/merchant/orders', { env, fetchImpl })).status).toBe(405);
});

test.each(['https://attacker.example', '', 'null'])('blocks cross-origin authentication before calling the backend: %s', async (origin) => {
  const fetchImpl = jest.fn();
  const response = await forwardMerchantAuth(request('/api/auth/sign-in/social', { method: 'POST', data: body, headers: { Origin: origin } }), 'sign-in/social', { env, fetchImpl });
  expect(response.status).toBe(403);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('only the explicit GitHub sign-in, callback, health and sign-out methods are exposed', async () => {
  const fetchImpl = jest.fn();
  for (const endpoint of ['sign-up/email', 'update-user', 'admin/create-user', 'get-session', '../sign-in/social']) {
    expect((await forwardMerchantAuth(request(`/api/auth/${endpoint}`), endpoint, { env, fetchImpl })).status).toBe(404);
  }
  expect((await forwardMerchantAuth(request('/api/auth/sign-out'), 'sign-out', { env, fetchImpl })).status).toBe(405);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([{ ...body, callbackURL: 'https://attacker.example' }, { ...body, provider: 'google' }, { ...body, role: 'merchant' }, {}, null])('rejects caller-selected redirects, providers or extra fields: %p', async (input) => {
  const fetchImpl = jest.fn();
  const result = await forwardMerchantAuth(request('/api/auth/sign-in/social', { method: 'POST', data: JSON.stringify(input) }), 'sign-in/social', { env, fetchImpl });
  expect(result.status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('preserves signed OAuth cookies and returns only the validated provider URL', async () => {
  const upstream = reply({ url: 'https://github.com/login/oauth/authorize?client_id=fixture&state=one-time', redirect: true, internal: 'not-for-browser' });
  upstream.headers.append('Set-Cookie', '__Secure-joys_merchant.state=one; Path=/; HttpOnly; Secure; SameSite=Lax');
  const fetchImpl = jest.fn().mockResolvedValue(upstream);
  const result = await forwardMerchantAuth(request('/api/auth/sign-in/social', { method: 'POST', data: body }), 'sign-in/social', { env, fetchImpl });
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ url: 'https://github.com/login/oauth/authorize?client_id=fixture&state=one-time' });
  expect(result.headers.getSetCookie()).toHaveLength(1);
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual', cache: 'no-store', headers: { Cookie: cookie, Origin: env.MERCHANT_AUTH_ORIGIN, 'Content-Type': 'application/json' } });
});

test('OAuth callback forwards one-time query and all cookie changes without following redirects', async () => {
  const upstream = new Response(null, { status: 302, headers: { Location: '/admin/orders' } });
  upstream.headers.append('Set-Cookie', '__Secure-joys_merchant.state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  upstream.headers.append('Set-Cookie', `${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  const fetchImpl = jest.fn().mockResolvedValue(upstream);
  const result = await forwardMerchantAuth(request('/api/auth/callback/github?code=fixture&state=fixture'), 'callback/github', { env, fetchImpl });
  expect(result.status).toBe(302);
  expect(result.headers.get('location')).toBe('/admin/orders');
  expect(result.headers.getSetCookie()).toHaveLength(2);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://joys-orders.vercel.app/api/auth/callback/github?code=fixture&state=fixture');
});

test.each(['https://attacker.example/admin/orders', '//attacker.example/admin/orders', 'https://github.com/login/oauth/authorize', '/api/auth/unexpected'])('rejects unexpected callback redirects: %s', async (location) => {
  const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: location } }));
  const result = await forwardMerchantAuth(request('/api/auth/callback/github?code=x&state=y'), 'callback/github', { env, fetchImpl });
  expect(result.status).toBe(503);
});

test.each(['tracking=private; Path=/; Secure; HttpOnly', `${cookie}; Domain=.vercel.app; Secure; HttpOnly`, `${cookie}; Path=/; Secure`, `${cookie}; Path=/; HttpOnly`])('rejects broadened or unsafe upstream cookies: %s', async (value) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ success: true }, 200, { 'Set-Cookie': value }));
  const result = await forwardMerchantAuth(request('/api/auth/sign-out', { method: 'POST' }), 'sign-out', { env, fetchImpl });
  expect(result.status).toBe(503);
});

test('sign-out sends no caller-controlled fields and propagates cookie expiration', async () => {
  const value = '__Secure-joys_merchant.session_token=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax';
  const fetchImpl = jest.fn().mockResolvedValue(reply({ success: true }, 200, { 'Set-Cookie': value }));
  const result = await forwardMerchantAuth(request('/api/auth/sign-out', { method: 'POST' }), 'sign-out', { env, fetchImpl });
  expect(result.status).toBe(200);
  expect(result.headers.getSetCookie()).toEqual([value]);
  expect(fetchImpl.mock.calls[0][1].body).toBe('{}');
});
