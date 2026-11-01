import 'server-only';
import { randomUUID } from 'node:crypto';
import { isPersistentDemo } from '../commerce-mode';

const cookieName = 'joys_order_guest';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const responseHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const error = (status, code, message) => Response.json({ error: { code, message } }, { status, headers: responseHeaders });

export function orderApiConfig(env = process.env) {
  const base = new URL(env.ORDERS_API_URL || 'invalid:');
  const local = base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)
    && env.ORDERS_ALLOW_LOCAL_API === 'true' && !env.VERCEL;
  const cloud = base.protocol === 'https:' && /^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(base.hostname) && !base.port;
  const secret = env.ORDERS_API_SECRET;
  if ((!local && !cloud) || base.username || base.password || base.search || base.hash || base.pathname !== '/'
    || typeof secret !== 'string' || secret.length < 32 || /\s/.test(secret)) throw new Error('Order API configuration unavailable');
  return { base, secret };
}

async function boundedBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required');
  let length = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16384) { await reader.cancel(); throw new Error('Request too large'); }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  JSON.parse(body);
  return body;
}

export async function forwardOrderRequest(request, path, { createGuest = false, fetchImpl = globalThis.fetch } = {}) {
  if (!isPersistentDemo) return error(503, 'ORDERS_DISABLED', 'Persistent demo orders are not enabled in this environment.');
  const requestUrl = new URL(request.url);
  // Next.js can reconstruct the internal URL with localhost. Host retains the
  // browser's destination; unlike Origin, a browser script cannot override it.
  const host = request.headers.get('host') || requestUrl.host;
  const expectedOrigin = `${requestUrl.protocol}//${host}`;
  if (request.method === 'POST' && (request.headers.get('origin') !== expectedOrigin
    || request.headers.get('sec-fetch-site') === 'cross-site')) {
    return error(403, 'INVALID_ORIGIN', 'Please submit your order from this storefront.');
  }
  const cookie = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`));
  const existingGuest = cookie?.slice(cookieName.length + 1);
  const guest = uuid.test(existingGuest || '') ? existingGuest : createGuest ? randomUUID() : null;
  if (!guest) return error(404, 'ORDER_NOT_FOUND', 'Order not found in this browser session.');
  let body;
  if (request.method === 'POST') {
    try { body = await boundedBody(request); }
    catch { return error(400, 'INVALID_REQUEST', 'Send a valid JSON request smaller than 16 KB.'); }
  }
  const headers = { 'Content-Type': 'application/json', 'x-guest-id': guest };
  if (path === '/v1/orders' && request.method === 'POST') {
    const key = request.headers.get('idempotency-key');
    if (!uuid.test(key || '')) return error(400, 'INVALID_REQUEST', 'A valid checkout recovery key is required.');
    headers['idempotency-key'] = key;
  }
  let response;
  try {
    const config = orderApiConfig();
    const target = new URL(`${config.base.pathname.replace(/\/$/, '')}${path}`, config.base.origin);
    const upstream = await fetchImpl(target.href, { method: request.method,
      headers: { ...headers, Authorization: `Bearer ${config.secret}` }, body,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (upstream.status >= 500 || [401, 403].includes(upstream.status)) {
      response = error(503, 'SERVICE_UNAVAILABLE', 'The order service is temporarily unavailable. Retry to recover the same order.');
    } else {
      const data = await upstream.json();
      response = Response.json(data, { status: upstream.status, headers: responseHeaders });
    }
  } catch {
    response = error(503, 'SERVICE_UNAVAILABLE', 'The order service is temporarily unavailable. Retry to recover the same order.');
  }
  if (createGuest) response.headers.set('Set-Cookie', `${cookieName}=${guest}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${requestUrl.protocol === 'https:' ? '; Secure' : ''}`);
  return response;
}
