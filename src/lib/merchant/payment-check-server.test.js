/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });

import { forwardMerchantPaymentCheck, forwardMerchantRequest } from './server';
import { POST } from '../../app/api/merchant/orders/[id]/recheck-payment/route';
import { GET } from '../../app/api/merchant/orders/[id]/payment-checks/route';

const env = { MERCHANT_AUTH_ENABLED: 'true', MERCHANT_AUTH_ORIGIN: 'https://joys-store.vercel.app', ORDERS_API_URL: 'https://joys-orders.vercel.app' };
const orderId = 'order_00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const cookie = '__Secure-joys_merchant.session_token=fixture.signed';
const request = ({ method = 'POST', headers = {}, body = JSON.stringify({ requestId }), query = '' } = {}) => new Request(`https://joys-store.vercel.app/api/merchant/orders/${orderId}/recheck-payment${query}`, {
  method, headers: { Cookie: cookie, Origin: env.MERCHANT_AUTH_ORIGIN, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...headers },
  ...(method === 'POST' ? { body } : {}),
});

test('recheck forwards only the fixed operation and signed merchant cookie, with no retry or service authority', async () => {
  const result = { order: { id: orderId }, check: { requestId, outcome: 'pending' }, replayed: false };
  const fetchImpl = jest.fn().mockResolvedValue(Response.json(result));
  const response = await forwardMerchantPaymentCheck(request({ headers: { Cookie: `joys_order_guest=private; ${cookie}`, Authorization: 'Bearer private-service-token', 'X-User-Id': 'forged', 'X-Forwarded-For': '1.2.3.4' } }), orderId, { env, fetchImpl });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith(`${env.ORDERS_API_URL}/v1/merchant/orders/${orderId}/recheck-payment`, {
    method: 'POST', headers: { Cookie: cookie, Origin: env.MERCHANT_AUTH_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }), cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal),
  });
});

test.each([
  { headers: { Origin: 'https://attacker.example' } },
  { headers: { Origin: 'null' } },
  { headers: { Origin: '' } },
  { headers: { 'Sec-Fetch-Site': 'cross-site' } },
  { headers: { 'Sec-Fetch-Site': 'same-site' } },
])('rejects cross-origin merchant writes before backend access: %j', async (input) => {
  const fetchImpl = jest.fn();
  expect((await forwardMerchantPaymentCheck(request(input), orderId, { env, fetchImpl })).status).toBe(403);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('guest, bearer and forged identity cannot authorize merchant payment changes', async () => {
  const fetchImpl = jest.fn();
  const response = await forwardMerchantPaymentCheck(request({ headers: { Cookie: 'joys_order_guest=guest', Authorization: 'Bearer service-secret', 'X-Merchant-Role': 'merchant' } }), orderId, { env, fetchImpl });
  expect(response.status).toBe(401);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([
  { body: '{}' }, { body: 'null' }, { body: '[]' }, { body: '{broken' },
  { body: JSON.stringify({ requestId: 'not-an-operation-key' }) },
  { body: JSON.stringify({ requestId, status: 'PAID' }) },
  { body: JSON.stringify({ requestId, actor: 'owner' }) },
  { body: JSON.stringify({ requestId, sessionId: 'cs_test_forged' }) },
  { body: JSON.stringify({ requestId, padding: 'x'.repeat(1024) }) },
  { headers: { 'Content-Type': 'text/plain' } },
  { headers: { 'Content-Type': 'application/jsonp' } },
  { query: '?status=paid' },
])('bounds the write payload and rejects client control of payment data: %j', async (input) => {
  const fetchImpl = jest.fn();
  expect((await forwardMerchantPaymentCheck(request(input), orderId, { env, fetchImpl })).status).toBe(400);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([
  ['PAYMENT_CHECK_IN_PROGRESS', 409], ['PAYMENT_CHECK_NOT_ELIGIBLE', 409],
  ['IDEMPOTENCY_CONFLICT', 409], ['PAYMENT_CHECK_RATE_LIMITED', 429],
])('preserves only the safe recovery contract: %s', async (code, status) => {
  const retryAt = '2026-11-02T12:00:30.000Z';
  const fetchImpl = jest.fn().mockResolvedValue(Response.json({ error: { code, message: 'private SQL/token', retryAt }, sql: 'private' }, { status }));
  const response = await forwardMerchantPaymentCheck(request(), orderId, { env, fetchImpl });
  expect(response.status).toBe(status);
  const data = await response.json();
  expect(data).toMatchObject({ error: { code, retryAt } });
  expect(JSON.stringify(data)).not.toMatch(/private|SQL|token/);
  expect(Object.keys(data)).toEqual(['error']);
});

test('malformed retry details and unrecognized provider errors cannot leak through', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(Response.json({ error: { code: 'PAYMENT_CHECK_RATE_LIMITED', retryAt: 'secret-detail' } }, { status: 429 }));
  const response = await forwardMerchantPaymentCheck(request(), orderId, { env, fetchImpl });
  expect((await response.json()).error.retryAt).toBeUndefined();
  for (const [status, code] of [[409, 'PRIVATE_SQL_FAILURE'], [429, 'PAYMENT_CHECK_IN_PROGRESS'], [500, 'SQL_FAILURE'], [302, 'REDIRECT']]) {
    const upstream = jest.fn().mockResolvedValue(Response.json({ error: { code, message: 'secret' } }, { status }));
    const failed = await forwardMerchantPaymentCheck(request(), orderId, { env, fetchImpl: upstream });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('secret');
  }
});

test.each([401, 403, 404])('retains authorization/not-found status without returning backend messages: %s', async (status) => {
  const fetchImpl = jest.fn().mockResolvedValue(Response.json({ error: { message: 'secret' } }, { status }));
  const result = await forwardMerchantPaymentCheck(request(), orderId, { env, fetchImpl });
  expect(result.status).toBe(status);
  expect(await result.text()).not.toContain('secret');
});

test('ambiguous timeout and oversized result return unavailable without retrying the write', async () => {
  for (const fetchImpl of [jest.fn().mockRejectedValue(new Error('timeout: secret')), jest.fn().mockResolvedValue(Response.json({ padding: 'x'.repeat(262145) }))]) {
    const response = await forwardMerchantPaymentCheck(request(), orderId, { env, fetchImpl });
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await response.text()).not.toContain('secret');
  }
});

test('history is a protected uncached read and route parameters cannot select a different destination', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(Response.json({ eligibility: { eligible: false }, events: [] }));
  const response = await forwardMerchantRequest(request({ method: 'GET' }), `/v1/merchant/orders/${orderId}/payment-checks`, { env, fetchImpl });
  expect(response.status).toBe(200);
  expect(fetchImpl.mock.calls[0][0]).toBe(`${env.ORDERS_API_URL}/v1/merchant/orders/${orderId}/payment-checks`);
  expect((await POST(request(), { params: Promise.resolve({ id: '../auth/sign-out' }) })).status).toBe(404);
  expect((await GET(request({ method: 'GET' }), { params: Promise.resolve({ id: 'https://attacker.example' }) })).status).toBe(404);
  expect((await GET(request({ method: 'GET', query: '?actor=forged' }), { params: Promise.resolve({ id: orderId }) })).status).toBe(400);
  expect((await forwardMerchantPaymentCheck(request({ method: 'GET' }), orderId, { env, fetchImpl })).status).toBe(405);
});
