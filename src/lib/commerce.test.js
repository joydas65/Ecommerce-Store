jest.mock('@chec/commerce.js', () => jest.fn());
jest.mock('./demo/commerce', () => ({ createDemoCommerce: jest.fn() }));
jest.mock('./orders/persistent-demo', () => ({ createPersistentDemoCommerce: jest.fn() }));
jest.mock('./orders/stripe-checkout', () => ({ createStripeCheckoutCommerce: jest.fn() }));

const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
  delete process.env.NEXT_PUBLIC_CATALOG_PROVIDER;
  delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  delete process.env.NEXT_PUBLIC_ORDER_STORAGE;
  delete process.env.NEXT_PUBLIC_DEMO_ORDER_STORAGE;
});

afterEach(() => {
  process.env = originalEnv;
});

test.each([undefined, 'demo', 'typo'])('uses only demo commerce for mode %s, even with merchant credentials', async (mode) => {
  if (mode === undefined) delete process.env.NEXT_PUBLIC_COMMERCE_MODE;
  else process.env.NEXT_PUBLIC_COMMERCE_MODE = mode;
  process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY = 'pk_fixture_present';
  const Commerce = require('@chec/commerce.js');
  const { createDemoCommerce } = require('./demo/commerce');
  const products = { data: [{ id: 'demo-product' }] };
  createDemoCommerce.mockReturnValue({ products: { list: jest.fn().mockResolvedValue(products) } });
  const { commerce } = require('./commerce');

  await expect(commerce.products.list()).resolves.toEqual(products);
  await expect(commerce.products.list()).resolves.toEqual(products);
  expect(createDemoCommerce).toHaveBeenCalledTimes(1);
  expect(Commerce).not.toHaveBeenCalled();
});

test('explicit live mode without a key fails without falling back to simulated orders', async () => {
  process.env.NEXT_PUBLIC_COMMERCE_MODE = 'live';
  process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY = '';
  const { createDemoCommerce } = require('./demo/commerce');
  const Commerce = require('@chec/commerce.js');
  const { commerce } = require('./commerce');

  await expect(commerce.products.list()).rejects.toThrow('temporarily unavailable');
  expect(createDemoCommerce).not.toHaveBeenCalled();
  expect(Commerce).not.toHaveBeenCalled();
});

test('live capture errors propagate without calling the demo provider', async () => {
  process.env.NEXT_PUBLIC_COMMERCE_MODE = 'live';
  const { createDemoCommerce } = require('./demo/commerce');
  const Commerce = require('@chec/commerce.js');
  const capture = jest.fn().mockRejectedValue(new Error('Live payment declined'));
  Commerce.mockImplementation(() => ({ checkout: { capture } }));
  const { commerce } = require('./commerce');
  const order = { payment: { gateway: 'stripe' } };

  await expect(commerce.checkout.capture('live-token', order)).rejects.toThrow('Live payment declined');
  expect(capture).toHaveBeenCalledWith('live-token', order);
  expect(createDemoCommerce).not.toHaveBeenCalled();
});

test.each(['local', 'remote'])('selects the explicit seeded %s order adapter independently of legacy live mode', async (orderStorage) => {
  Object.assign(process.env, {
    NEXT_PUBLIC_COMMERCE_MODE: 'live', NEXT_PUBLIC_CATALOG_PROVIDER: 'seeded',
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'simulated', NEXT_PUBLIC_ORDER_STORAGE: orderStorage,
  });
  const Commerce = require('@chec/commerce.js');
  const { createDemoCommerce } = require('./demo/commerce');
  const { createPersistentDemoCommerce } = require('./orders/persistent-demo');
  const selected = orderStorage === 'remote' ? createPersistentDemoCommerce : createDemoCommerce;
  const products = { data: [{ id: 'seeded-product' }] };
  selected.mockReturnValue({ products: { list: jest.fn().mockResolvedValue(products) } });
  const { commerce } = require('./commerce');

  await expect(commerce.products.list()).resolves.toEqual(products);
  expect(selected).toHaveBeenCalledTimes(1);
  expect(orderStorage === 'remote' ? createDemoCommerce : createPersistentDemoCommerce).not.toHaveBeenCalled();
  expect(Commerce).not.toHaveBeenCalled();
});

test('selects explicit legacy Stripe checkout without requiring the old live-mode switch', async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_COMMERCE_MODE: 'demo', NEXT_PUBLIC_CATALOG_PROVIDER: 'commercejs',
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'stripe', NEXT_PUBLIC_ORDER_STORAGE: 'commercejs',
  });
  const Commerce = require('@chec/commerce.js');
  const { createDemoCommerce } = require('./demo/commerce');
  const capture = jest.fn().mockResolvedValue({ id: 'order_1', status_payment: 'paid' });
  Commerce.mockImplementation(() => ({ checkout: { capture } }));
  const { commerce } = require('./commerce');

  await expect(commerce.checkout.capture('token_1', { payment: { gateway: 'stripe' } })).resolves.toMatchObject({ status_payment: 'paid' });
  expect(createDemoCommerce).not.toHaveBeenCalled();
  expect(Commerce).toHaveBeenCalledTimes(1);
});

test('selects hosted Stripe independently of both simulated payment and Commerce.js', async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_CATALOG_PROVIDER: 'seeded', NEXT_PUBLIC_PAYMENT_PROVIDER: 'stripe', NEXT_PUBLIC_ORDER_STORAGE: 'remote',
  });
  const { createStripeCheckoutCommerce } = require('./orders/stripe-checkout');
  const startPayment = jest.fn().mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/c/pay/test' });
  createStripeCheckoutCommerce.mockReturnValue({ checkout: { startPayment } });
  const { commerce } = require('./commerce');
  await expect(commerce.checkout.startPayment('token')).resolves.toHaveProperty('checkoutUrl');
  expect(startPayment).toHaveBeenCalledWith('token');
  expect(require('@chec/commerce.js')).not.toHaveBeenCalled();
  expect(require('./demo/commerce').createDemoCommerce).not.toHaveBeenCalled();
  expect(require('./orders/persistent-demo').createPersistentDemoCommerce).not.toHaveBeenCalled();
});

test.each([
  { NEXT_PUBLIC_CATALOG_PROVIDER: 'seeded', NEXT_PUBLIC_PAYMENT_PROVIDER: 'stripe', NEXT_PUBLIC_ORDER_STORAGE: 'local' },
  { NEXT_PUBLIC_PAYMENT_PROVIDER: 'unknown' },
])('rejects invalid capabilities before loading any provider (%j)', (overrides) => {
  Object.assign(process.env, overrides);
  const Commerce = require('@chec/commerce.js');
  const { createDemoCommerce } = require('./demo/commerce');
  const { createPersistentDemoCommerce } = require('./orders/persistent-demo');

  expect(() => require('./commerce')).toThrow(/storefront configuration/);
  expect(Commerce).not.toHaveBeenCalled();
  expect(createDemoCommerce).not.toHaveBeenCalled();
  expect(createPersistentDemoCommerce).not.toHaveBeenCalled();
});
