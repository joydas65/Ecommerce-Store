jest.mock('@chec/commerce.js', () => jest.fn());
jest.mock('./demo/commerce', () => ({ createDemoCommerce: jest.fn() }));

const originalMode = process.env.NEXT_PUBLIC_COMMERCE_MODE;
const originalKey = process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY;

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_COMMERCE_MODE = originalMode;
  process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY = originalKey;
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
