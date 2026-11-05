import 'server-only';
import { merchantProviderUrl } from './provider-url';

const cookiePrefix = /^(?:__Secure-)?joys_merchant\.[A-Za-z0-9_.-]+$/;
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const messages = {
  400: ['INVALID_MERCHANT_QUERY', 'Choose a valid order filter and page.'],
  401: ['AUTH_REQUIRED', 'Sign in to view merchant orders.'],
  403: ['MERCHANT_FORBIDDEN', 'This account does not have merchant access.'],
  404: ['ORDER_NOT_FOUND', 'This order is unavailable.'],
  405: ['METHOD_NOT_ALLOWED', 'This operation is unavailable.'],
  409: ['PAYMENT_CHECK_CONFLICT', 'Refresh this order before checking its payment again.'],
  429: ['RATE_LIMITED', 'Too many sign-in requests. Please wait before trying again.'],
  503: ['MERCHANT_UNAVAILABLE', 'Merchant access is temporarily unavailable. Please try again.'],
};
const paymentCheckMessages = {
  PAYMENT_CHECK_IN_PROGRESS: [409, 'A payment check is already running. Wait briefly, then recover its result.'],
  PAYMENT_CHECK_NOT_ELIGIBLE: [409, 'This order is not eligible for a payment check. Refresh its saved status.'],
  IDEMPOTENCY_CONFLICT: [409, 'This request belongs to another order. Refresh before trying again.'],
  PAYMENT_CHECK_RATE_LIMITED: [429, 'Please wait before checking payment status again.'],
};

export function merchantError(status) {
  const [code, message] = messages[status] || messages[503];
  return Response.json({ error: { code, message } }, { status, headers: privateHeaders });
}

export function merchantConfig(env = process.env) {
  if (env.MERCHANT_AUTH_ENABLED !== 'true') throw new Error('Merchant access unavailable');
  const base = new URL(env.ORDERS_API_URL || 'invalid:');
  const origin = new URL(env.MERCHANT_AUTH_ORIGIN || 'invalid:');
  const localAllowed = env.ORDERS_ALLOW_LOCAL_API === 'true' && !env.VERCEL;
  const isLocal = (url) => localAllowed && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  const isCloud = (url) => url.protocol === 'https:' && /^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(url.hostname) && !url.port;
  for (const url of [base, origin]) {
    if ((!isLocal(url) && !isCloud(url)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid merchant configuration');
  }
  return { base: base.origin, origin: origin.origin };
}

export function merchantCookies(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value)) return '';
  const found = new Set();
  const cookies = [];
  for (const entry of value.split(';')) {
    const pair = entry.trim();
    const split = pair.indexOf('=');
    const name = pair.slice(0, split);
    if (split < 1 || !cookiePrefix.test(name)) continue;
    if (found.has(name) || !/^[\x21-\x7e]+$/.test(pair)) return '';
    found.add(name);
    cookies.push(pair);
  }
  return cookies.join('; ');
}

async function jsonWithinLimit(response, maxBytes = 262144) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing response');
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('Response too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function readMerchant(path, cookie, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  try {
    const config = merchantConfig(env);
    const filtered = merchantCookies(cookie);
    if (!filtered) return { status: 401 };
    const response = await fetchImpl(`${config.base}${path}`, { headers: { Cookie: filtered },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (response.status !== 200) return { status: [400, 401, 403, 404, 429].includes(response.status) ? response.status : 503 };
    return { status: 200, data: await jsonWithinLimit(response) };
  } catch { return { status: 503 }; }
}

export async function merchantSession(cookie, options) {
  const result = await readMerchant('/v1/merchant/session', cookie, options);
  if (result.status === 200 && (result.data?.role !== 'merchant' || typeof result.data.user?.id !== 'string' || !result.data.user.id)) return { status: 503 };
  return result;
}

export async function forwardMerchantRequest(request, path, options) {
  if (request.method !== 'GET') return merchantError(405);
  if (new URL(request.url).search.length > 8192) return merchantError(400);
  const result = await readMerchant(path, request.headers.get('cookie'), options);
  return result.status === 200 ? Response.json(result.data, { headers: privateHeaders }) : merchantError(result.status);
}

// This is the only merchant write exposed by the storefront. The destination,
// payload and forwarded identity are fixed here; the backend independently
// authorizes the database session and checks the canonical Origin again.
export async function forwardMerchantPaymentCheck(request, orderId, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (request.method !== 'POST') return merchantError(405);
  if (!/^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(orderId)) return merchantError(404);
  let config;
  try { config = merchantConfig(env); } catch { return merchantError(503); }
  if (request.headers.get('origin') !== config.origin
    || ![null, 'same-origin', 'none'].includes(request.headers.get('sec-fetch-site'))) return merchantError(403);
  if (new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return merchantError(400);
  const cookie = merchantCookies(request.headers.get('cookie'));
  if (!cookie) return merchantError(401);
  let input;
  try { input = await jsonWithinLimit(request, 1024); } catch { return merchantError(400); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).join(',') !== 'requestId'
    || typeof input.requestId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.requestId)) return merchantError(400);
  try {
    const upstream = await fetchImpl(`${config.base}/v1/merchant/orders/${orderId}/recheck-payment`, {
      method: 'POST', headers: { Cookie: cookie, Origin: config.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: input.requestId }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    if (upstream.status === 200) return Response.json(await jsonWithinLimit(upstream), { headers: privateHeaders });
    if ([409, 429].includes(upstream.status)) {
      const data = await jsonWithinLimit(upstream, 16384);
      const known = Object.hasOwn(paymentCheckMessages, data?.error?.code) ? paymentCheckMessages[data.error.code] : null;
      if (!known || known[0] !== upstream.status) return merchantError(503);
      const retryAt = data.error.retryAt;
      const retry = typeof retryAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(retryAt)
        && Number.isFinite(Date.parse(retryAt)) ? { retryAt } : {};
      return Response.json({ error: { code: data.error.code, message: known[1], ...retry } }, { status: upstream.status, headers: privateHeaders });
    }
    return merchantError([400, 401, 403, 404].includes(upstream.status) ? upstream.status : 503);
  } catch { return merchantError(503); }
}

const authMethods = { 'ok': 'GET', 'callback/github': 'GET', 'callback/google': 'GET', 'sign-in/social': 'POST', 'link-social': 'POST', 'sign-out': 'POST' };

function validReturnLocation(location, origin) {
  try {
    const target = new URL(location, origin);
    return target.origin === origin && ['/admin/orders', '/admin/sign-in'].includes(target.pathname) && !target.username && !target.password;
  } catch { return false; }
}

export async function forwardMerchantAuth(request, endpoint, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!Object.hasOwn(authMethods, endpoint)) return merchantError(404);
  if (authMethods[endpoint] !== request.method) return merchantError(405);
  let config;
  try { config = merchantConfig(env); } catch { return merchantError(503); }
  const googleEnabled = env.MERCHANT_GOOGLE_ENABLED === 'true';
  if (!googleEnabled && ['callback/google', 'link-social'].includes(endpoint)) return merchantError(404);
  const url = new URL(request.url);
  if (url.search.length > 8192 || (!endpoint.startsWith('callback/') && url.search)) return merchantError(400);
  const headers = { Cookie: merchantCookies(request.headers.get('cookie')) };
  let body;
  let provider;
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== config.origin || ['same-site', 'cross-site'].includes(request.headers.get('sec-fetch-site'))) return merchantError(403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return merchantError(400);
    let input;
    try { input = await jsonWithinLimit(request, 16384); } catch { return merchantError(400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return merchantError(400);
    if (endpoint === 'sign-in/social' || endpoint === 'link-social') {
      if (Object.keys(input).sort().join(',') !== 'callbackURL,errorCallbackURL,provider' || !['github', ...(googleEnabled ? ['google'] : [])].includes(input.provider)
        || input.callbackURL !== '/admin/orders' || input.errorCallbackURL !== '/admin/sign-in') return merchantError(400);
      provider = input.provider;
      if (endpoint === 'link-social' && provider !== 'google') return merchantError(400);
      if (endpoint === 'link-social' && !headers.Cookie) return merchantError(401);
    } else if (Object.keys(input).length) return merchantError(400);
    body = JSON.stringify(input);
    headers['Content-Type'] = 'application/json';
    headers.Origin = config.origin;
  }
  try {
    const upstream = await fetchImpl(`${config.base}/api/auth/${endpoint}${url.search}`, {
      method: request.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12000),
    });
    const location = upstream.headers.get('location');
    let response;
    if ([302, 303, 307].includes(upstream.status)) {
      if (!location || !validReturnLocation(location, config.origin)) return merchantError(503);
      response = new Response(null, { status: upstream.status, headers: { ...privateHeaders, Location: location } });
    } else if (upstream.status === 200) {
      const data = await jsonWithinLimit(upstream, 16384);
      if (endpoint === 'sign-in/social' || endpoint === 'link-social') {
        const target = merchantProviderUrl(data.url, provider);
        if (!target) return merchantError(503);
        response = Response.json({ url: target }, { headers: privateHeaders });
      } else response = Response.json({ success: true }, { headers: privateHeaders });
    } else response = merchantError([400, 401, 403, 429].includes(upstream.status) ? upstream.status : 503);
    for (const cookie of upstream.headers.getSetCookie()) {
      const name = cookie.slice(0, cookie.indexOf('='));
      if (!cookiePrefix.test(name) || /;\s*domain=/i.test(cookie) || !/;\s*httponly(?:;|$)/i.test(cookie)
        || (config.origin.startsWith('https:') && !/;\s*secure(?:;|$)/i.test(cookie))) return merchantError(503);
      response.headers.append('Set-Cookie', cookie);
    }
    return response;
  } catch { return merchantError(503); }
}
