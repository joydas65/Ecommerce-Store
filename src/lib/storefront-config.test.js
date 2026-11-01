import { getStorefrontConfig } from './storefront-config';

const explicit = (catalog, payment, orders) => ({
  NEXT_PUBLIC_CATALOG_PROVIDER: catalog,
  NEXT_PUBLIC_PAYMENT_PROVIDER: payment,
  NEXT_PUBLIC_ORDER_STORAGE: orders,
});

test('defaults to credential-free seeded shopping with simulated local checkout', () => {
  expect(getStorefrontConfig({ NEXT_PUBLIC_COMMERCE_PUBLIC_KEY: 'pk_fixture', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_fixture' })).toEqual({
    catalogProvider: 'seeded', paymentProvider: 'simulated', orderStorage: 'local',
    usesSeededCatalog: true, usesSimulatedPayment: true, usesPersistentOrders: false, usesLegacyCommerce: false, usesHostedStripe: false,
  });
});

test.each([
  ['demo', undefined, 'seeded', 'simulated', 'local'],
  ['demo', 'remote', 'seeded', 'simulated', 'remote'],
  ['live', 'remote', 'commercejs', 'stripe', 'commercejs'],
  ['legacy-unknown', undefined, 'seeded', 'simulated', 'local'],
])('preserves legacy deployment mode %s and storage %s', (mode, storage, catalogProvider, paymentProvider, orderStorage) => {
  expect(getStorefrontConfig({ NEXT_PUBLIC_COMMERCE_MODE: mode, NEXT_PUBLIC_DEMO_ORDER_STORAGE: storage })).toMatchObject({
    catalogProvider, paymentProvider, orderStorage,
    usesPersistentOrders: orderStorage === 'remote',
  });
});

test.each([
  ['seeded', 'simulated', 'local', true],
  ['seeded', 'simulated', 'remote', true],
  ['seeded', 'simulated', 'commercejs', false],
  ['seeded', 'stripe', 'local', false],
  ['seeded', 'stripe', 'remote', true],
  ['seeded', 'stripe', 'commercejs', false],
  ['commercejs', 'simulated', 'local', false],
  ['commercejs', 'simulated', 'remote', false],
  ['commercejs', 'simulated', 'commercejs', false],
  ['commercejs', 'stripe', 'local', false],
  ['commercejs', 'stripe', 'remote', false],
  ['commercejs', 'stripe', 'commercejs', true],
])('validates the supported provider combination %s/%s/%s', (catalog, payment, orders, supported) => {
  const resolve = () => getStorefrontConfig(explicit(catalog, payment, orders));
  if (!supported) {
    expect(resolve).toThrow('Unsupported storefront configuration');
    return;
  }
  expect(resolve()).toMatchObject({
    catalogProvider: catalog, paymentProvider: payment, orderStorage: orders,
    usesSeededCatalog: catalog === 'seeded', usesSimulatedPayment: payment === 'simulated',
    usesPersistentOrders: orders === 'remote', usesLegacyCommerce: catalog === 'commercejs',
    usesHostedStripe: catalog === 'seeded' && payment === 'stripe' && orders === 'remote',
  });
});

test('new explicit settings override legacy defaults without changing another capability', () => {
  expect(getStorefrontConfig({ NEXT_PUBLIC_COMMERCE_MODE: 'live', ...explicit('seeded', 'simulated', 'remote') })).toMatchObject({
    usesSeededCatalog: true, usesSimulatedPayment: true, usesPersistentOrders: true, usesLegacyCommerce: false,
  });
  expect(getStorefrontConfig({ NEXT_PUBLIC_COMMERCE_MODE: 'demo', NEXT_PUBLIC_ORDER_STORAGE: 'remote' })).toMatchObject({
    catalogProvider: 'seeded', paymentProvider: 'simulated', orderStorage: 'remote',
  });
  expect(() => getStorefrontConfig({ NEXT_PUBLIC_COMMERCE_MODE: 'demo', NEXT_PUBLIC_CATALOG_PROVIDER: 'commercejs' })).toThrow('Unsupported storefront configuration');
});

test.each([
  ['NEXT_PUBLIC_CATALOG_PROVIDER', 'unknown'],
  ['NEXT_PUBLIC_PAYMENT_PROVIDER', 'STRIPE'],
  ['NEXT_PUBLIC_ORDER_STORAGE', ''],
  ['NEXT_PUBLIC_PAYMENT_PROVIDER', 'sk_fixture_do_not_echo'],
])('rejects an unknown explicit %s without exposing its value', (name, value) => {
  try {
    getStorefrontConfig({ [name]: value });
    throw new Error('Expected invalid configuration to fail');
  } catch (error) {
    expect(error.message).toContain(`Invalid storefront configuration: ${name}`);
    if (value) expect(error.message).not.toContain(value);
  }
});
