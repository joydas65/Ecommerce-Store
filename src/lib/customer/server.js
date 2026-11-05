import 'server-only';
import { customerSignInBody, googleAuthorizationUrl } from './auth-contract';
import { getStorefrontConfig } from '../storefront-config';

const cookiePrefix = /^(?:__Secure-)?joys_customer\.[A-Za-z0-9_.-]+$/;
const orderId = /^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const messages = {
  400: ['INVALID_CUSTOMER_QUERY', 'Choose a valid order page.'],
  401: ['AUTH_REQUIRED', 'Sign in to view your orders.'],
  403: ['CUSTOMER_FORBIDDEN', 'This request is not allowed.'],
  404: ['ORDER_NOT_FOUND', 'This order is unavailable.'],
  405: ['METHOD_NOT_ALLOWED', 'This operation is unavailable.'],
  429: ['RATE_LIMITED', 'Too many requests. Please wait before trying again.'],
  503: ['CUSTOMER_UNAVAILABLE', 'Your account is temporarily unavailable. Please try again.'],
};

export function customerError(status) {
  const safeStatus = Object.hasOwn(messages, status) ? status : 503;
  const [code, message] = messages[safeStatus];
  return Response.json({ error: { code, message } }, { status: safeStatus, headers: privateHeaders });
}

export function customerConfig(env = process.env) {
  if (env.CUSTOMER_AUTH_ENABLED !== 'true') throw new Error('Customer access unavailable');
  if (!getStorefrontConfig(env).usesPersistentOrders) throw new Error('Customer accounts require remote orders');
  const base = new URL(env.ORDERS_API_URL || 'invalid:');
  const origin = new URL(env.CUSTOMER_AUTH_ORIGIN || 'invalid:');
  const localAllowed = env.ORDERS_ALLOW_LOCAL_API === 'true' && !env.VERCEL;
  const valid = (url) => ((localAllowed && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    || (url.protocol === 'https:' && /^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(url.hostname) && !url.port))
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  if (!valid(base) || !valid(origin)) throw new Error('Invalid customer configuration');
  return { base: base.origin, origin: origin.origin };
}

export function customerAccountsEnabled(env = process.env) {
  try { customerConfig(env); return true; } catch { return false; }
}

export function customerCookies(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value)) return '';
  const names = new Set();
  const cookies = [];
  for (const entry of value.split(';')) {
    const pair = entry.trim();
    const split = pair.indexOf('=');
    const name = pair.slice(0, split);
    if (split < 1 || !cookiePrefix.test(name)) continue;
    if (names.has(name) || !/^[\x21-\x7e]+$/.test(pair)) return '';
    names.add(name);
    cookies.push(pair);
  }
  return cookies.join('; ');
}

async function jsonWithinLimit(response, limit = 262144) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('Body too large'); }
    chunks.push(value);
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

function validReadPath(path) {
  try {
    const url = new URL(path, 'https://orders.internal');
    if (url.origin !== 'https://orders.internal' || !path.startsWith('/v1/customer/') || url.hash) return false;
    if (url.pathname === '/v1/customer/session') return !url.search;
    if (url.pathname === '/v1/customer/orders') {
      const keys = [...url.searchParams.keys()];
      return url.search.length <= 2048 && keys.every((key) => ['cursor', 'limit'].includes(key)) && keys.length === new Set(keys).size;
    }
    return !url.search && orderId.test(url.pathname.slice('/v1/customer/orders/'.length)) && url.pathname.startsWith('/v1/customer/orders/');
  } catch { return false; }
}

export async function readCustomer(path, cookie, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!validReadPath(path)) return { status: 400 };
  try {
    const config = customerConfig(env);
    const filtered = customerCookies(cookie);
    if (!filtered) return { status: 401 };
    const response = await fetchImpl(`${config.base}${path}`, { headers: { Cookie: filtered },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (response.status !== 200) return { status: [400, 401, 403, 404, 429].includes(response.status) ? response.status : 503 };
    return { status: 200, data: await jsonWithinLimit(response) };
  } catch { return { status: 503 }; }
}

export async function customerSession(cookie, options) {
  const result = await readCustomer('/v1/customer/session', cookie, options);
  if (result.status !== 200) return result;
  const user = result.data?.user;
  if (result.data?.role !== 'customer' || typeof user?.id !== 'string' || !user.id || user.id.length > 128
    || typeof user.displayName !== 'string' || !user.displayName || user.displayName.length > 80 || /[\p{Cc}\p{Cf}]/u.test(user.displayName)) return { status: 503 };
  return { status: 200, data: { role: 'customer', user: { id: user.id, displayName: user.displayName } } };
}

export async function forwardCustomerRequest(request, path, options) {
  if (request.method !== 'GET') return customerError(405);
  if (new URL(request.url).search.length > 2048) return customerError(400);
  const result = path === '/v1/customer/session'
    ? await customerSession(request.headers.get('cookie'), options)
    : await readCustomer(path, request.headers.get('cookie'), options);
  return result.status === 200 ? Response.json(result.data, { headers: privateHeaders }) : customerError(result.status);
}

const authMethods = { ok: 'GET', 'callback/google': 'GET', 'sign-in/social': 'POST', 'sign-out': 'POST' };
function validReturnLocation(value, origin) {
  try {
    const target = new URL(value, origin);
    return target.origin === origin && ['/account', '/account/sign-in'].includes(target.pathname)
      && !target.username && !target.password && !target.hash;
  } catch { return false; }
}

export async function forwardCustomerAuth(request, endpoint, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!Object.hasOwn(authMethods, endpoint)) return customerError(404);
  if (request.method !== authMethods[endpoint]) return customerError(405);
  let config;
  try { config = customerConfig(env); } catch { return customerError(503); }
  const url = new URL(request.url);
  if (url.search.length > 8192 || (endpoint !== 'callback/google' && url.search)) return customerError(400);
  const headers = { Cookie: customerCookies(request.headers.get('cookie')) };
  let body;
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== config.origin || ![null, 'same-origin', 'none'].includes(request.headers.get('sec-fetch-site'))) return customerError(403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return customerError(400);
    let input;
    try { input = await jsonWithinLimit(request, 1024); } catch { return customerError(400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return customerError(400);
    if (endpoint === 'sign-in/social') {
      if (Object.keys(input).sort().join(',') !== 'callbackURL,errorCallbackURL,provider'
        || Object.entries(customerSignInBody).some(([key, value]) => input[key] !== value)) return customerError(400);
    } else if (Object.keys(input).length) return customerError(400);
    body = JSON.stringify(input);
    headers.Origin = config.origin;
    headers['Content-Type'] = 'application/json';
  }
  try {
    const upstream = await fetchImpl(`${config.base}/api/customer-auth/${endpoint}${url.search}`, {
      method: request.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
    let response;
    if ([302, 303, 307].includes(upstream.status)) {
      const location = upstream.headers.get('location');
      if (!location || !validReturnLocation(location, config.origin)) return customerError(503);
      response = new Response(null, { status: upstream.status, headers: { ...privateHeaders, Location: location } });
    } else if (upstream.status === 200) {
      const data = await jsonWithinLimit(upstream, 16384);
      if (endpoint === 'sign-in/social') {
        const target = googleAuthorizationUrl(data.url);
        if (!target) return customerError(503);
        response = Response.json({ url: target }, { headers: privateHeaders });
      } else {
        if ((endpoint === 'sign-out' && data.success !== true) || (endpoint === 'ok' && data.status !== 'ok')) return customerError(503);
        response = Response.json({ success: true }, { headers: privateHeaders });
      }
    } else response = customerError([400, 401, 403, 429].includes(upstream.status) ? upstream.status : 503);
    for (const cookie of upstream.headers.getSetCookie()) {
      const name = cookie.slice(0, cookie.indexOf('='));
      if (!cookiePrefix.test(name) || /;\s*domain=/i.test(cookie) || !/;\s*httponly(?:;|$)/i.test(cookie)
        || !/;\s*path=\/(?:;|$)/i.test(cookie) || !/;\s*samesite=lax(?:;|$)/i.test(cookie)
        || (config.origin.startsWith('https:') && !/;\s*secure(?:;|$)/i.test(cookie))) return customerError(503);
      response.headers.append('Set-Cookie', cookie);
    }
    return response;
  } catch { return customerError(503); }
}
