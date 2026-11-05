// Local integration harness only. Production imports none of this file, and no
// provider-host or fixture-controller option is added to the deployed service.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const storefrontOrigin = 'http://127.0.0.1:3100';
const servicePort = 4101;
const fixtureSecret = 'sk_test_localMerchantFixture';
const scenarios = new Set(['pending', 'paid', 'timeout', 'mismatch', 'expired', 'missing_session', 'simulated']);

export function fixtureConfiguration(env = process.env) {
  const database = new URL(env.DATABASE_URL || 'invalid:');
  if (env.VERCEL || env.MERCHANT_TEST_FIXTURES !== 'true'
    || !['postgres:', 'postgresql:'].includes(database.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
    || !database.pathname.slice(1) || env.BETTER_AUTH_URL !== storefrontOrigin
    || env.MERCHANT_AUTH_ENABLED !== 'true' || env.MERCHANT_ALLOW_LOCAL_AUTH !== 'true'
    || env.CUSTOMER_AUTH_URL !== storefrontOrigin || env.CUSTOMER_AUTH_ENABLED !== 'true'
    || env.CUSTOMER_ALLOW_LOCAL_AUTH !== 'true' || env.CUSTOMER_TEST_FIXTURES !== 'true'
    || env.MERCHANT_GOOGLE_ENABLED !== 'true' || env.GOOGLE_CLIENT_ID !== 'fixture-google.apps.googleusercontent.com'
    || env.GOOGLE_CLIENT_SECRET !== 'fixture-google-secret-at-least-20') {
    throw new Error('Merchant recheck fixtures require explicit opt-in, local authentication, and disposable loopback PostgreSQL.');
  }
  const backendDirectory = path.resolve(env.E2E_ORDERS_SERVICE_DIR
    || (existsSync('.orders-service/package.json') ? '.orders-service' : '../Ecommerce-Orders'));
  if (!existsSync(path.join(backendDirectory, 'package.json'))) throw new Error('The local order-service checkout is unavailable.');
  return { backendDirectory };
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
  response.end(JSON.stringify(value));
}

async function readInput(request) {
  if (request.headers['content-type']?.split(';')[0].toLowerCase() !== 'application/json') throw new Error('Expected JSON');
  if (request.headers.origin && request.headers.origin !== storefrontOrigin) throw new Error('Unexpected fixture origin');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024) throw new Error('Fixture input is too large');
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid fixture input');
  return value;
}

async function input(request) {
  const value = await readInput(request);
  if (Object.keys(value).some((key) => !['scenario', 'delayMs'].includes(key))
    || !scenarios.has(value.scenario)
    || (value.delayMs !== undefined && (!Number.isInteger(value.delayMs) || value.delayMs < 0 || value.delayMs > 6000))) {
    throw new Error('Invalid fixture scenario');
  }
  return { scenario: value.scenario, delayMs: value.delayMs || 0 };
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function sessionFor(order, id, scenario) {
  const lines = [...order.items.map((item) => ({ description: item.name, quantity: item.quantity,
    currency: order.currency.toLowerCase(), price: { currency: order.currency.toLowerCase(), unit_amount: item.unitPriceCents },
    amount_subtotal: item.lineTotalCents, amount_total: item.lineTotalCents })),
  { description: 'Sample tax (8%, test only)', quantity: 1, currency: 'usd', price: { currency: 'usd', unit_amount: order.taxCents },
    amount_subtotal: order.taxCents, amount_total: order.taxCents }];
  return {
    id, object: 'checkout.session', livemode: false, mode: 'payment', currency: 'usd',
    status: scenario === 'paid' || scenario === 'mismatch' ? 'complete' : scenario === 'expired' ? 'expired' : 'open',
    payment_status: scenario === 'paid' || scenario === 'mismatch' ? 'paid' : 'unpaid',
    amount_total: order.totalCents + (scenario === 'mismatch' ? 1 : 0),
    client_reference_id: order.id, metadata: { orderId: order.id },
    payment_intent: scenario === 'paid' || scenario === 'mismatch' ? `pi_fixture${order.id.replaceAll('-', '').slice(6)}` : null,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    url: scenario === 'pending' || scenario === 'timeout' ? `https://checkout.stripe.com/c/pay/${id}` : null,
    line_items: { object: 'list', data: lines, has_more: false },
    total_details: { amount_shipping: order.shippingCents, amount_tax: 0, amount_discount: 0 },
  };
}

export async function startFixtureService(env = process.env) {
  const { backendDirectory } = fixtureConfiguration(env);
  const backendImport = (file) => import(pathToFileURL(path.join(backendDirectory, file)).href);
  const [{ createHandler }, { createPool }, { migrate }, { OrderService }, { MerchantOrders },
    { createMerchantAuth }, { createStripeGateway, stripeApiVersion }, { cleanupExpired }, { MerchantPaymentChecks },
    { createCustomerAuth }, { CustomerOrders }] = await Promise.all([
    backendImport('src/api.js'), backendImport('src/database.js'), backendImport('src/migrate.js'),
    backendImport('src/service.js'), backendImport('src/merchant-orders.js'), backendImport('src/merchant-auth.js'),
    backendImport('src/stripe-gateway.js'), backendImport('src/cleanup.js'), backendImport('src/merchant-payment-checks.js'),
    backendImport('src/customer-auth.js'), backendImport('src/customer-orders.js'),
  ]);
  const requireBackend = createRequire(path.join(backendDirectory, 'package.json'));
  const Stripe = requireBackend('stripe');
  const orders = new Map();
  const sessions = new Map();
  let forbiddenCreates = 0;
  let forbiddenExpires = 0;
  const provider = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://provider.fixture');
      if (request.headers.authorization !== `Bearer ${fixtureSecret}`) return json(response, 401, { error: { message: 'Fixture credentials required' } });
      if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
        forbiddenCreates += 1;
        return json(response, 405, { error: { message: 'Session creation is forbidden in merchant rechecks' } });
      }
      if (request.method === 'POST' && /^\/v1\/checkout\/sessions\/[^/]+\/expire$/.test(url.pathname)) {
        forbiddenExpires += 1;
        return json(response, 405, { error: { message: 'Session expiry is forbidden in merchant rechecks' } });
      }
      const match = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(url.pathname);
      const fixture = match && sessions.get(match[1]);
      if (request.method !== 'GET' || !fixture) return json(response, 404, { error: { message: 'Fixture session unavailable' } });
      fixture.retrieve += 1;
      const { scenario, delayMs } = fixture;
      if (delayMs || scenario === 'timeout') await delay(scenario === 'timeout' ? Math.max(delayMs, 5000) : delayMs);
      if (!response.destroyed) json(response, 200, sessionFor(fixture.order, fixture.sessionId, scenario));
    } catch { if (!response.destroyed) json(response, 500, { error: { message: 'Fixture provider failed' } }); }
  });
  let pool;
  let server;
  try {
    await listen(provider, 0);
    pool = createPool(env);
    await migrate(pool);
    const stripeClient = new Stripe(fixtureSecret, { apiVersion: stripeApiVersion, host: '127.0.0.1',
      port: provider.address().port, protocol: 'http', timeout: 4000, maxNetworkRetries: 0, telemetry: false });
    const stripeGateway = createStripeGateway({ stripeClient, storefrontOrigin, webhookSecret: 'whsec_localMerchantFixture' });
    const service = new OrderService(pool, { stripeGateway });
    const auth = createMerchantAuth({ pool, env });
    const customerAuth = createCustomerAuth({ pool, env });
    const merchantOrders = new MerchantOrders(pool);
    const handler = createHandler({ service, merchantOrders, merchantPaymentChecks: new MerchantPaymentChecks(pool, { service }), merchantAuth: () => auth,
      authorizeMerchant: (request) => auth.authorize(request), secret: env.ORDERS_API_SECRET,
      customerAuth: () => customerAuth, authorizeCustomer: (request) => customerAuth.authorize(request), customerOrders: new CustomerOrders(pool),
      cronSecret: 'local-merchant-fixture-cleanup-secret', cleanup: () => cleanupExpired(pool), logger: () => {} });

    async function seed(settings) {
      const paymentProvider = settings.scenario === 'simulated' ? 'simulated' : 'stripe-test';
      const guest = randomUUID();
      const quote = await service.createQuote(guest, { paymentProvider, items: [{ productId: 'demo-notebook', quantity: 1 }],
        destination: { country: 'US', region: 'CA' }, shippingMethod: 'demo-standard' });
      const { order } = await service.reserveOrder(guest, { quoteId: quote.id }, randomUUID(), paymentProvider);
      const sessionId = `cs_test_fixture${randomUUID().replaceAll('-', '')}`;
      const fixture = { ...settings, order, sessionId, retrieve: 0 };
      orders.set(order.id, fixture);
      sessions.set(sessionId, fixture);
      if (paymentProvider === 'stripe-test' && settings.scenario !== 'missing_session') {
        await pool.query('UPDATE payment_sessions SET stripe_session_id = $2, session_expires_at = $3 WHERE order_id = $1',
          [order.id, sessionId, new Date(Date.now() + 3600000)]);
      }
      return { id: order.id, reference: order.reference };
    }

    server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://service.fixture');
      if (!url.pathname.startsWith('/__fixtures/')) return handler(request, response);
      try {
        if (url.search) return json(response, 400, { error: 'Unexpected fixture query' });
        if (request.method === 'POST' && url.pathname === '/__fixtures/orders') return json(response, 201, await seed(await input(request)));
        const webhook = /^\/__fixtures\/orders\/(order_[0-9a-f-]{36})\/webhook$/.exec(url.pathname);
        if (request.method === 'POST' && webhook) {
          if (Object.keys(await readInput(request)).length) return json(response, 400, { error: 'Fixture webhook expects an empty object' });
          const fixture = orders.get(webhook[1]);
          if (!fixture || ['missing_session', 'simulated'].includes(fixture.scenario)) return json(response, 404, { error: 'Fixture session unavailable' });
          const event = { id: `evt_fixture${randomUUID().replaceAll('-', '')}`, object: 'event', livemode: false,
            type: fixture.scenario === 'expired' ? 'checkout.session.expired' : 'checkout.session.completed',
            api_version: stripeApiVersion, created: Math.floor(Date.now() / 1000),
            data: { object: sessionFor(fixture.order, fixture.sessionId, fixture.scenario) } };
          const body = JSON.stringify(event);
          const signature = stripeClient.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_localMerchantFixture' });
          const result = await fetch(`http://127.0.0.1:${servicePort}/v1/webhooks/stripe`, { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body, signal: AbortSignal.timeout(12000) });
          return json(response, result.status, result.status === 200 ? { received: true } : { error: 'Fixture webhook was rejected' });
        }
        const update = /^\/__fixtures\/orders\/(order_[0-9a-f-]{36})$/.exec(url.pathname);
        if (request.method === 'POST' && update) {
          const fixture = orders.get(update[1]);
          if (!fixture) return json(response, 404, { error: 'Fixture order unavailable' });
          const settings = await input(request);
          if (['missing_session', 'simulated'].includes(settings.scenario)) return json(response, 400, { error: 'This scenario is only available when creating a fixture' });
          Object.assign(fixture, settings);
          return json(response, 200, { id: fixture.order.id, scenario: settings.scenario });
        }
        const counts = /^\/__fixtures\/requests\/(order_[0-9a-f-]{36})$/.exec(url.pathname);
        if (request.method === 'GET' && counts) {
          const fixture = orders.get(counts[1]);
          return fixture ? json(response, 200, { retrieve: fixture.retrieve, create: forbiddenCreates, expire: forbiddenExpires })
            : json(response, 404, { error: 'Fixture order unavailable' });
        }
        return json(response, 404, { error: 'Fixture endpoint unavailable' });
      } catch { return json(response, 400, { error: 'Fixture request failed' }); }
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    await listen(server, servicePort);
    return async () => {
      server.closeAllConnections();
      provider.closeAllConnections();
      await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => provider.close(resolve))]);
      await pool.end();
    };
  } catch (error) {
    server?.closeAllConnections();
    server?.close();
    provider.closeAllConnections();
    provider.close();
    if (pool) await pool.end();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const close = await startFixtureService();
    console.info(`Local merchant recheck fixtures listening on http://127.0.0.1:${servicePort}`);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
      if (stopping) return;
      stopping = true;
      await close();
      process.exit(0);
    });
  } catch {
    console.error('Local merchant recheck fixture service could not start. Check local configuration and migrations.');
    process.exitCode = 1;
  }
}
