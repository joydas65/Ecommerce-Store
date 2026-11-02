import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as base, expect } from '@playwright/test';

const runFile = promisify(execFile);
export const origin = 'http://127.0.0.1:3100';
const backendDirectory = process.env.E2E_ORDERS_SERVICE_DIR || (existsSync('.orders-service/package.json') ? '.orders-service' : '../Ecommerce-Orders');

export function browserCookie(raw) {
  const equals = raw.indexOf('=');
  if (equals < 1 || !raw.startsWith('joys_merchant.session_token=')) throw new Error('Unexpected local fixture cookie.');
  return { name: raw.slice(0, equals), value: raw.slice(equals + 1), url: origin, httpOnly: true, sameSite: 'Lax' };
}

export const test = base.extend({
  browserHealth: [async ({ page, context }, provide) => {
    const errors = [];
    const observe = (tab) => {
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => {
        if (message.type() === 'error' && /hydration|did not match|server rendered/i.test(message.text())) errors.push(message.text());
      });
    };
    observe(page);
    context.on('page', observe);
    await provide();
    expect(errors, 'Browser and hydration errors').toEqual([]);
  }, { auto: true }],
  sessionFixtures: async ({ baseURL }, provide) => {
    if (baseURL !== origin) throw new Error('Merchant fixtures require the local storefront origin.');
    const directory = await mkdtemp(path.join(tmpdir(), 'merchant-browser-'));
    try {
      const file = path.join(directory, 'sessions.json');
      await runFile(process.execPath, [path.resolve(backendDirectory, 'scripts/test/seed-merchant-session.mjs'), file], {
        cwd: path.resolve(backendDirectory),
        env: {
          ...process.env,
          MERCHANT_TEST_FIXTURES: 'true',
          MERCHANT_TEST_RUN_ID: randomUUID(),
          MERCHANT_AUTH_ENABLED: 'true',
          BETTER_AUTH_URL: origin,
          MERCHANT_ALLOW_LOCAL_AUTH: 'true',
          GITHUB_CLIENT_ID: 'fixture-client',
          GITHUB_CLIENT_SECRET: 'fixture-client-secret-at-least-20',
          MERCHANT_GITHUB_IDS: '123456789',
        },
        timeout: 30_000,
      });
      const fixture = JSON.parse(await readFile(file, 'utf8'));
      await rm(file);
      await provide(fixture);
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
  merchant: async ({ context, sessionFixtures }, provide) => {
    await context.addCookies([browserCookie(sessionFixtures.merchant.cookie)]);
    await provide(context);
  },
});

export async function createSyntheticOrder(request, quantity = 1) {
  const headers = { Origin: origin };
  const quoteResponse = await request.post('/api/checkout/quotes', { headers, data: {
    items: [{ productId: 'demo-notebook', quantity }],
    destination: { country: 'US', region: 'CA' }, shippingMethod: 'demo-standard', paymentProvider: 'simulated',
  } });
  expect(quoteResponse.status()).toBe(201);
  const quote = await quoteResponse.json();
  const response = await request.post('/api/orders', { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { quoteId: quote.id } });
  expect(response.status()).toBe(201);
  return response.json();
}


export { expect };
