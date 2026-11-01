/** @jest-environment node */
jest.mock('server-only', () => ({}), { virtual: true });

import { catalog } from './demo/catalog';
import { loadProduct } from './product-reader';

const merchantProduct = {
  id: 'prod_fixture',
  name: 'Merchant notebook',
  permalink: 'merchant-notebook',
  description: '<p>Paper for <strong>everyday</strong> notes &amp; plans.</p>',
  price: { raw: 18, formatted_with_symbol: '$18.00' },
  media: { source: 'https://images.example.com/notebook.jpg' },
};
const reply = (data, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: jest.fn().mockResolvedValue(data),
});
const options = (fetchImpl) => ({ catalogProvider: 'commercejs', publicKey: 'pk_test_fixture', fetchImpl });

test.each(catalog)('reads $permalink directly from demo fixtures without a browser or network', async (product) => {
  const fetchImpl = jest.fn();
  const result = await loadProduct(product.permalink, { catalogProvider: 'seeded', fetchImpl });

  expect(typeof window).toBe('undefined');
  expect(result).toMatchObject({
    status: 'ready',
    product: {
      id: product.id, permalink: product.permalink, name: product.name,
      price: { raw: product.cents / 100 }, details: product.details,
    },
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('accepts a demo product id and isolates returned details from fixture mutation', async () => {
  const first = await loadProduct('demo-desk-mat', { catalogProvider: 'seeded' });
  first.product.details.features.push('Changed');
  first.product.details.specifications[0].value = 'Changed';

  const second = await loadProduct('desk-mat', { catalogProvider: 'seeded' });
  expect(second.product.details).toEqual(catalog[0].details);
});

test.each(['missing-product', '', '../desk-mat', 'desk/mat', 'desk%2Fmat', 'a'.repeat(129), null, undefined])(
  'returns not-found for absent or invalid demo identifier %p', async (slug) => {
    const fetchImpl = jest.fn();
    await expect(loadProduct(slug, { catalogProvider: 'seeded', fetchImpl })).resolves.toEqual({ status: 'not-found' });
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);

test.each(['../products', 'a?type=id', 'a'.repeat(129)])('rejects invalid live identifiers before fetch: %p', async (slug) => {
  const fetchImpl = jest.fn();
  await expect(loadProduct(slug, options(fetchImpl))).resolves.toEqual({ status: 'not-found' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('requests a permalink with a public header, no cache, bounded timeout, and no redirects', async () => {
  const timeout = jest.spyOn(AbortSignal, 'timeout');
  const fetchImpl = jest.fn().mockResolvedValue(reply(merchantProduct));

  const result = await loadProduct('merchant-notebook', options(fetchImpl));

  expect(fetchImpl).toHaveBeenCalledWith('https://api.chec.io/v1/products/merchant-notebook?type=permalink', {
    method: 'GET',
    headers: { 'X-Authorization': 'pk_test_fixture' },
    cache: 'no-store', signal: expect.any(AbortSignal), redirect: 'error',
  });
  expect(timeout).toHaveBeenCalledWith(8000);
  timeout.mockRestore();
  expect(result).toEqual({
    status: 'ready',
    product: { ...merchantProduct, description: 'Paper for everyday notes & plans.' },
  });
});

test('retrieves product ids without the permalink query and supplies a route fallback', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ ...merchantProduct, permalink: undefined }));
  const result = await loadProduct('prod_fixture', options(fetchImpl));
  expect(fetchImpl.mock.calls[0][0]).toBe('https://api.chec.io/v1/products/prod_fixture');
  expect(result.product.permalink).toBe('prod_fixture');
});

test.each(['', '   ', null])('explicit live mode with missing credentials stays unavailable (%p)', async (publicKey) => {
  const fetchImpl = jest.fn();
  await expect(loadProduct('desk-mat', { catalogProvider: 'commercejs', publicKey, fetchImpl }))
    .resolves.toEqual({ status: 'unavailable' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test.each([400, 401, 403, 429, 500, 503])('HTTP %i is unavailable rather than not-found', async (status) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({}, status));
  await expect(loadProduct('merchant-notebook', options(fetchImpl))).resolves.toEqual({ status: 'unavailable' });
});

test('HTTP404 is not-found without requiring an error response body', async () => {
  const response = reply(null, 404);
  const fetchImpl = jest.fn().mockResolvedValue(response);
  await expect(loadProduct('merchant-notebook', options(fetchImpl))).resolves.toEqual({ status: 'not-found' });
  expect(response.json).not.toHaveBeenCalled();
});

test.each([new Error('Network unavailable'), new DOMException('Timed out', 'TimeoutError')])(
  'transport failures remain unavailable', async (error) => {
    const fetchImpl = jest.fn().mockRejectedValue(error);
    await expect(loadProduct('merchant-notebook', options(fetchImpl))).resolves.toEqual({ status: 'unavailable' });
  },
);

test.each([
  null, {}, [],
  { ...merchantProduct, id: '' },
  { ...merchantProduct, name: ' ' },
  { ...merchantProduct, price: null },
  { ...merchantProduct, price: { raw: '18', formatted_with_symbol: '$18.00' } },
  { ...merchantProduct, price: { raw: -1, formatted_with_symbol: '$18.00' } },
  { ...merchantProduct, price: { raw: Infinity, formatted_with_symbol: '$18.00' } },
  { ...merchantProduct, price: { raw: 18, formatted_with_symbol: '' } },
])('malformed successful responses remain unavailable: %p', async (product) => {
  const fetchImpl = jest.fn().mockResolvedValue(reply(product));
  await expect(loadProduct('merchant-notebook', options(fetchImpl))).resolves.toEqual({ status: 'unavailable' });
});

test('invalid JSON remains unavailable', async () => {
  const response = reply(null);
  response.json.mockRejectedValue(new SyntaxError('Invalid JSON'));
  const fetchImpl = jest.fn().mockResolvedValue(response);
  await expect(loadProduct('merchant-notebook', options(fetchImpl))).resolves.toEqual({ status: 'unavailable' });
});

test('normalizes merchant text without importing a browser parser or inventing specifications', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({
    ...merchantProduct,
    description: '<style>bad css</style><script>alert(1)</script><p>One&nbsp;&amp; two</p><p>&#10003; &#x2713; &lt;sample&gt;</p>',
    media: { source: 'javascript:alert(1)' },
    details: { features: ['Untrusted arbitrary field'] },
    internal_field: 'not part of public product model',
  }));
  const result = await loadProduct('merchant-notebook', options(fetchImpl));
  expect(result.product.description).toBe('One & two ✓ ✓ <sample>');
  expect(result.product.media.source).toBe('');
  expect(result.product).not.toHaveProperty('details');
  expect(result.product).not.toHaveProperty('internal_field');
});

test('allows absent optional merchant description and image without losing an otherwise valid product', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(reply({ ...merchantProduct, description: undefined, media: null }));
  const result = await loadProduct('merchant-notebook', options(fetchImpl));
  expect(result).toMatchObject({ status: 'ready', product: { description: '', media: { source: '' } } });
});
