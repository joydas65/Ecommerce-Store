import 'server-only';

const cookiePrefix = /^(?:__Secure-)?joys_merchant\.[A-Za-z0-9_.-]+$/;
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const messages = {
  400: ['INVALID_MERCHANT_QUERY', 'Choose a valid order filter and page.'],
  401: ['AUTH_REQUIRED', 'Sign in to view merchant orders.'],
  403: ['MERCHANT_FORBIDDEN', 'This account does not have merchant access.'],
  404: ['ORDER_NOT_FOUND', 'This order is unavailable.'],
  405: ['METHOD_NOT_ALLOWED', 'This operation is unavailable.'],
  429: ['RATE_LIMITED', 'Too many sign-in requests. Please wait before trying again.'],
  503: ['MERCHANT_UNAVAILABLE', 'Merchant access is temporarily unavailable. Please try again.'],
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

const authMethods = { 'ok': 'GET', 'callback/github': 'GET', 'sign-in/social': 'POST', 'sign-out': 'POST' };

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
  const url = new URL(request.url);
  if (url.search.length > 8192 || (endpoint !== 'callback/github' && url.search)) return merchantError(400);
  const headers = { Cookie: merchantCookies(request.headers.get('cookie')) };
  let body;
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') return merchantError(403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return merchantError(400);
    let input;
    try { input = await jsonWithinLimit(request, 16384); } catch { return merchantError(400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return merchantError(400);
    if (endpoint === 'sign-in/social') {
      if (Object.keys(input).sort().join(',') !== 'callbackURL,errorCallbackURL,provider' || input.provider !== 'github'
        || input.callbackURL !== '/admin/orders' || input.errorCallbackURL !== '/admin/sign-in') return merchantError(400);
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
      if (endpoint === 'sign-in/social') {
        const target = new URL(data.url);
        if (target.origin !== 'https://github.com' || target.pathname !== '/login/oauth/authorize' || target.username || target.password) return merchantError(503);
        response = Response.json({ url: target.href }, { headers: privateHeaders });
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
