import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureConfiguration } from './merchant-recheck-service.mjs';

const local = {
  DATABASE_URL: 'postgresql://fixture:local-only@127.0.0.1:5433/fixture',
  MERCHANT_TEST_FIXTURES: 'true',
  MERCHANT_AUTH_ENABLED: 'true',
  MERCHANT_ALLOW_LOCAL_AUTH: 'true',
  BETTER_AUTH_URL: 'http://127.0.0.1:3100',
  CUSTOMER_AUTH_URL: 'http://127.0.0.1:3100',
  CUSTOMER_AUTH_ENABLED: 'true',
  CUSTOMER_ALLOW_LOCAL_AUTH: 'true',
  CUSTOMER_TEST_FIXTURES: 'true',
  MERCHANT_GOOGLE_ENABLED: 'true',
  GOOGLE_CLIENT_ID: 'fixture-google.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fixture-google-secret-at-least-20',
  E2E_ORDERS_SERVICE_DIR: process.cwd(),
};

test('the standalone fixture runner refuses deployment and remote or ambiguous configuration before importing the backend', () => {
  assert.ok(fixtureConfiguration(local).backendDirectory);
  for (const change of [
    { VERCEL: '1' },
    { MERCHANT_TEST_FIXTURES: undefined },
    { MERCHANT_AUTH_ENABLED: 'false' },
    { MERCHANT_ALLOW_LOCAL_AUTH: 'false' },
    { CUSTOMER_AUTH_ENABLED: 'false' },
    { CUSTOMER_ALLOW_LOCAL_AUTH: 'false' },
    { CUSTOMER_TEST_FIXTURES: undefined },
    { CUSTOMER_AUTH_URL: 'https://joys-store.vercel.app' },
    { MERCHANT_GOOGLE_ENABLED: 'false' },
    { GOOGLE_CLIENT_ID: 'real-client.apps.googleusercontent.com' },
    { GOOGLE_CLIENT_SECRET: 'real-provider-secret-not-permitted' },
    { DATABASE_URL: 'postgresql://fixture:local-only@db.example/fixture' },
    { DATABASE_URL: 'https://127.0.0.1/fixture' },
    { DATABASE_URL: 'postgresql://127.0.0.1' },
    { BETTER_AUTH_URL: 'https://joys-store.vercel.app' },
    { BETTER_AUTH_URL: 'http://127.0.0.1:3101' },
    { E2E_ORDERS_SERVICE_DIR: '/missing-order-service-checkout' },
  ]) assert.throws(() => fixtureConfiguration({ ...local, ...change }));
});
