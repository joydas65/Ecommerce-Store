/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });

import { customerAccountsEnabled, customerConfig, customerCookies, customerSession, forwardCustomerAuth, forwardCustomerRequest, readCustomer } from './server';
import { customerSignInBody, googleAuthorizationUrl } from './auth-contract';

const env = { CUSTOMER_AUTH_ENABLED: 'true', CUSTOMER_AUTH_ORIGIN: 'https://joys-store.vercel.app', ORDERS_API_URL: 'https://joys-orders.vercel.app', NEXT_PUBLIC_ORDER_STORAGE: 'remote' };
const cookie = '__Secure-joys_customer.session_token=fixture.signed';
const request = (path, { method = 'GET', body = '{}', headers = {} } = {}) => new Request(`https://joys-store.vercel.app${path}`, {
  method, headers: { Cookie: cookie, Origin: env.CUSTOMER_AUTH_ORIGIN, 'Content-Type': 'application/json', ...headers },
  ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});
const reply = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
const authRequest = (options = {}) => request('/api/customer-auth/sign-in/social', { method: 'POST', body: customerSignInBody, ...options });
const googleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture&state=one-time';

test('customer config is explicitly enabled and fixes both service and app origins', () => {
  expect(customerConfig(env)).toEqual({ base: env.ORDERS_API_URL, origin: env.CUSTOMER_AUTH_ORIGIN });
  for (const change of [{ CUSTOMER_AUTH_ENABLED: 'false' }, { ORDERS_API_URL: 'https://example.com' }, { CUSTOMER_AUTH_ORIGIN: 'https://user:pass@joys-store.vercel.app' },
    { CUSTOMER_AUTH_ORIGIN: 'https://joys-store.vercel.app/other' }, { ORDERS_API_URL: 'https://joys-orders.vercel.app:8443' }, { ORDERS_API_URL: 'https://joys-orders.vercel.app?x=1' }]) {
    expect(() => customerConfig({ ...env, ...change })).toThrow();
  }
  const local = { ...env, ORDERS_API_URL: 'http://127.0.0.1:4100', CUSTOMER_AUTH_ORIGIN: 'http://127.0.0.1:3100', ORDERS_ALLOW_LOCAL_API: 'true' };
  expect(customerConfig(local).base).toBe(local.ORDERS_API_URL);
  expect(() => customerConfig({ ...local, VERCEL: '1' })).toThrow();
});

test('customer accounts are available only when checkout saves remote orders', () => {
  expect(customerAccountsEnabled(env)).toBe(true);
  expect(customerAccountsEnabled({ ...env, NEXT_PUBLIC_PAYMENT_PROVIDER: 'stripe' })).toBe(true);
  for (const change of [
    { NEXT_PUBLIC_ORDER_STORAGE: undefined }, { NEXT_PUBLIC_ORDER_STORAGE: 'local' },
    { NEXT_PUBLIC_CATALOG_PROVIDER: 'commercejs', NEXT_PUBLIC_PAYMENT_PROVIDER: 'stripe', NEXT_PUBLIC_ORDER_STORAGE: 'commercejs' },
    { CUSTOMER_AUTH_ENABLED: 'false' }, { CUSTOMER_AUTH_ORIGIN: '' },
  ]) {
    const config = { ...env, ...change };
    expect(customerAccountsEnabled(config)).toBe(false);
    expect(() => customerConfig(config)).toThrow();
  }
  expect(customerAccountsEnabled({ ...env, NEXT_PUBLIC_ORDER_STORAGE: undefined, NEXT_PUBLIC_DEMO_ORDER_STORAGE: 'remote' })).toBe(true);
});

test('only customer cookies pass the boundary; merchant, guest and ambiguous cookies never authenticate', () => {
  expect(customerCookies(`joys_order_guest=guest; ${cookie}; __Secure-joys_merchant.session_token=merchant; tracking=x`)).toBe(cookie);
  expect(customerCookies('joys_customer.state=one; joys_customer.session_token=two')).toBe('joys_customer.state=one; joys_customer.session_token=two');
  for (const invalid of [`${cookie}; ${cookie}`, `${cookie}\r\nforged=x`, 'x'.repeat(8193), '__Secure-joys_merchant.session_token=merchant']) expect(customerCookies(invalid)).toBe('');
});

test('the customer reader denies missing customer cookies without forwarding identity headers', async () => {
  const fetchImpl = jest.fn();
  const result = await forwardCustomerRequest(request('/api/customer/orders', { headers: { Cookie: 'joys_order_guest=guest; joys_merchant.session_token=merchant', Authorization: 'Bearer service-secret', 'x-user-id': 'customer' } }), '/v1/customer/orders', { fetchImpl, env });
  expect(result.status).toBe(401);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('customer reads use the fixed backend, private headers and only the customer cookie', async () => {
  const data = { orders: [], pageInfo: { nextCursor: null, hasMore: false } };
  const fetchImpl = jest.fn().mockResolvedValue(reply(data));
  const result = await forwardCustomerRequest(request('/api/customer/orders?limit=20', { headers: { Cookie: `${cookie}; joys_order_guest=private`, Authorization: 'Bearer secret', 'x-user-id': 'forged' } }), '/v1/customer/orders?limit=20', { env, fetchImpl });
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(data);
  expect(result.headers.get('cache-control')).toBe('private, no-store');
  expect(result.headers.get('vary')).toBe('Cookie');
  expect(fetchImpl).toHaveBeenCalledWith('https://joys-orders.vercel.app/v1/customer/orders?limit=20', expect.objectContaining({ headers: { Cookie: cookie }, cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }));
});

test.each(['/v1/merchant/orders', 'https://attacker.example/v1/customer/orders', '/v1/customer/orders/../../merchant/orders', '/v1/customer/session?role=merchant', '/v1/customer/orders?userId=forged', '/v1/customer/orders?limit=1&limit=2'])('rejects unexpected customer read destinations: %s', async (path) => {
  const fetchImpl = jest.fn();
  expect((await readCustomer(path, cookie, { fetchImpl, env })).status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([400, 401, 403, 404, 429, 500])('sanitizes customer dependency errors: %s', async (status) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ sql: 'private-data', token: 'private-token' }, status));
  const response = await forwardCustomerRequest(request('/api/customer/orders'), '/v1/customer/orders', { fetchImpl, env });
  expect(response.status).toBe(status === 500 ? 503 : status);
  expect(await response.text()).not.toMatch(/private-data|private-token/);
});

test('customer session validates role and a safe display name and projects allowed fields', async () => {
  for (const data of [{ role: 'merchant', user: { id: 'u', displayName: 'User' } }, { role: 'customer', user: { id: 'u' } }, { role: 'customer', user: { id: 'u', displayName: '\u202eSpoof' } }, { role: 'customer', user: { id: 'u', displayName: 'x'.repeat(81) } }]) {
    expect((await customerSession(cookie, { env, fetchImpl: jest.fn().mockResolvedValue(reply(data)) })).status).toBe(503);
  }
  const fetchImpl = jest.fn().mockResolvedValue(reply({ role: 'customer', user: { id: 'u', displayName: 'Shopper', email: 'private@example.com' }, token: 'private' }));
  expect(await customerSession(cookie, { env, fetchImpl })).toEqual({ status: 200, data: { role: 'customer', user: { id: 'u', displayName: 'Shopper' } } });
});

test('malformed, oversized and timed-out responses fail closed', async () => {
  for (const fetchImpl of [jest.fn().mockRejectedValue(new Error('timeout')), jest.fn().mockResolvedValue(new Response('{')), jest.fn().mockResolvedValue(reply({ body: 'x'.repeat(262145) }))]) {
    expect((await readCustomer('/v1/customer/orders', cookie, { env, fetchImpl })).status).toBe(503);
  }
});

test.each(['https://attacker.example', '', 'null'])('rejects an invalid authentication Origin: %s', async (Origin) => {
  const fetchImpl = jest.fn();
  const result = await forwardCustomerAuth(authRequest({ headers: { Origin } }), 'sign-in/social', { fetchImpl, env });
  expect(result.status).toBe(403); expect(fetchImpl).not.toHaveBeenCalled();
});

test.each(['cross-site', 'same-site'])('rejects cross-site authentication even with spoofed Origin: %s', async (site) => {
  const fetchImpl = jest.fn();
  expect((await forwardCustomerAuth(authRequest({ headers: { 'sec-fetch-site': site } }), 'sign-in/social', { fetchImpl, env })).status).toBe(403);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([{ ...customerSignInBody, provider: 'github' }, { ...customerSignInBody, callbackURL: '/admin/orders' }, { ...customerSignInBody, role: 'merchant' }, { ...customerSignInBody, errorCallbackURL: 'https://attacker.example' }, null, []])('rejects caller-controlled providers, callbacks and fields: %p', async (body) => {
  const fetchImpl = jest.fn();
  expect((await forwardCustomerAuth(authRequest({ body: JSON.stringify(body) }), 'sign-in/social', { fetchImpl, env })).status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('only the explicit customer OAuth and logout routes are exposed', async () => {
  const fetchImpl = jest.fn();
  for (const endpoint of ['sign-up/email', 'get-session', 'update-user', 'link-social', 'callback/github', '../auth/sign-in/social']) {
    expect((await forwardCustomerAuth(request(`/api/customer-auth/${endpoint}`), endpoint, { fetchImpl, env })).status).toBe(404);
  }
  expect((await forwardCustomerAuth(request('/api/customer-auth/sign-out'), 'sign-out', { fetchImpl, env })).status).toBe(405);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('sign-in forwards only fixed fields and preserves safe signed state cookies', async () => {
  const stateCookie = '__Secure-joys_customer.state=one; Path=/; HttpOnly; Secure; SameSite=Lax';
  const fetchImpl = jest.fn().mockResolvedValue(reply({ url: googleUrl, internal: 'private' }, 200, { 'Set-Cookie': stateCookie }));
  const response = await forwardCustomerAuth(authRequest(), 'sign-in/social', { fetchImpl, env });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ url: googleUrl });
  expect(response.headers.getSetCookie()).toEqual([stateCookie]);
  expect(fetchImpl.mock.calls[0]).toEqual(['https://joys-orders.vercel.app/api/customer-auth/sign-in/social', expect.objectContaining({ body: JSON.stringify(customerSignInBody), redirect: 'manual', headers: { Cookie: cookie, Origin: env.CUSTOMER_AUTH_ORIGIN, 'Content-Type': 'application/json' } })]);
});

test.each(['https://attacker.example', 'https://accounts.google.com.evil.example/o/oauth2/v2/auth', 'https://accounts.google.com/other', 'https://user:pass@accounts.google.com/o/oauth2/v2/auth', 'http://accounts.google.com/o/oauth2/v2/auth', '//accounts.google.com/o/oauth2/v2/auth'])('rejects unsafe provider authorization redirects: %s', async (url) => {
  expect(googleAuthorizationUrl(url)).toBeNull();
  const fetchImpl = jest.fn().mockResolvedValue(reply({ url }));
  expect((await forwardCustomerAuth(authRequest(), 'sign-in/social', { fetchImpl, env })).status).toBe(503);
});

test('callback forwards code/state and safe cookie changes without following the redirect', async () => {
  const upstream = new Response(null, { status: 302, headers: { Location: '/account' } });
  upstream.headers.append('Set-Cookie', '__Secure-joys_customer.state=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
  upstream.headers.append('Set-Cookie', `${cookie}; Path=/; Secure; HttpOnly; SameSite=Lax`);
  const fetchImpl = jest.fn().mockResolvedValue(upstream);
  const response = await forwardCustomerAuth(request('/api/customer-auth/callback/google?code=fixture&state=once'), 'callback/google', { fetchImpl, env });
  expect(response.status).toBe(302); expect(response.headers.get('location')).toBe('/account');
  expect(response.headers.getSetCookie()).toHaveLength(2);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://joys-orders.vercel.app/api/customer-auth/callback/google?code=fixture&state=once');
});

test.each(['/admin/orders', 'https://attacker.example/account', '//attacker.example/account', '/account/orders/forged', '/account#unexpected'])('rejects unexpected callback destinations: %s', async (Location) => {
  const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location } }));
  expect((await forwardCustomerAuth(request('/api/customer-auth/callback/google'), 'callback/google', { fetchImpl, env })).status).toBe(503);
});

test.each(['joys_merchant.session_token=other; Path=/; HttpOnly; Secure; SameSite=Lax', `${cookie}; Domain=.vercel.app; Path=/; HttpOnly; Secure; SameSite=Lax`, `${cookie}; Path=/; Secure; SameSite=Lax`, `${cookie}; Path=/; HttpOnly; SameSite=Lax`, `${cookie}; Path=/; HttpOnly; Secure; SameSite=None`])('rejects unsafe or other-role cookies: %s', async (value) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ success: true }, 200, { 'Set-Cookie': value }));
  expect((await forwardCustomerAuth(request('/api/customer-auth/sign-out', { method: 'POST' }), 'sign-out', { fetchImpl, env })).status).toBe(503);
});

test('sign-out forwards no arbitrary fields, verifies success and expires the session cookie', async () => {
  const expired = '__Secure-joys_customer.session_token=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax';
  const fetchImpl = jest.fn().mockResolvedValue(reply({ success: true }, 200, { 'Set-Cookie': expired }));
  const response = await forwardCustomerAuth(request('/api/customer-auth/sign-out', { method: 'POST' }), 'sign-out', { fetchImpl, env });
  expect(response.status).toBe(200); expect(response.headers.getSetCookie()).toEqual([expired]);
  expect(fetchImpl.mock.calls[0][1].body).toBe('{}');
  expect((await forwardCustomerAuth(request('/api/customer-auth/sign-out', { method: 'POST', body: { userId: 'other' } }), 'sign-out', { fetchImpl, env })).status).toBe(400);
  expect((await forwardCustomerAuth(request('/api/customer-auth/sign-out', { method: 'POST' }), 'sign-out', { fetchImpl: jest.fn().mockResolvedValue(reply({})), env })).status).toBe(503);
});
