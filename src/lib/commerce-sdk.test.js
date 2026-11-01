import Commerce from '@chec/commerce.js';

// Exercise the real SDK and its overridden Axios transport. Every HTTP request
// terminates in this adapter; no merchant credentials or external calls are used.
const createClient = (respond) => {
  const adapter = jest.fn(async (config) => ({
    data: await respond(config),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }));
  const client = new Commerce('pk_test_sdk_contract', false, {
    disableStorage: true,
    eventCallback: jest.fn(),
    axiosConfig: { adapter },
  });
  return { client, adapter };
};

const cart = { id: 'cart_1', total_items: 2, line_items: [{ id: 'item_1', quantity: 2 }] };
const updatedCart = { ...cart, total_items: 3, line_items: [{ id: 'item_1', quantity: 3 }] };
const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });
const live = {
  line_items: cart.line_items,
  subtotal: money(20),
  shipping: { price: money(5) },
  tax: { amount: money(2) },
  total_with_tax: money(27),
};

test('product retrieval sends permalink query parameters through the real SDK transport', async () => {
  const product = { id: 'prod_notebook', permalink: 'notebook', name: 'Notebook' };
  const { client, adapter } = createClient(() => product);

  expect(await client.products.retrieve('notebook', { type: 'permalink' })).toEqual(product);
  expect(adapter.mock.calls[0][0]).toEqual(expect.objectContaining({
    url: 'products/notebook', method: 'get', params: { type: 'permalink' },
    baseURL: 'https://api.chec.io/v1/',
  }));
  expect(adapter.mock.calls[0][0].headers['X-Authorization']).toBe('pk_test_sdk_contract');
});

test('product id retrieval sends no permalink query and preserves provider 404', async () => {
  const transportError = Object.assign(new Error('Product not found'), {
    response: { status: 404, statusText: 'Not Found', data: { error: { message: 'Product not found' } } },
  });
  const { client, adapter } = createClient(() => { throw transportError; });

  await expect(client.products.retrieve('prod_missing')).rejects.toMatchObject({ statusCode: 404 });
  expect(adapter.mock.calls[0][0]).toEqual(expect.objectContaining({
    url: 'products/prod_missing', method: 'get', params: {},
  }));
});

test.each([
  ['add', ['product_1', 3], 'carts/cart_1', 'post', { id: 'product_1', quantity: 3 }],
  ['update', ['item_1', { quantity: 3 }], 'carts/cart_1/items/item_1', 'put', { quantity: 3 }],
  ['remove', ['item_1'], 'carts/cart_1/items/item_1', 'delete', null],
  ['empty', [], 'carts/cart_1/items', 'delete', null],
])('cart.%s retains the cart response with the real Axios transport', async (method, args, url, httpMethod, body) => {
  const { client, adapter } = createClient((config) => (
    config.method === 'get' ? cart : { cart: updatedCart }
  ));
  expect(await client.cart.retrieve('cart_1')).toEqual(cart);

  const result = await client.cart[method](...args);

  expect(result.cart).toEqual(updatedCart);
  const request = adapter.mock.calls[1][0];
  expect(request).toEqual(expect.objectContaining({
    url,
    method: httpMethod,
    baseURL: 'https://api.chec.io/v1/',
  }));
  expect(request.headers['X-Authorization']).toBe('pk_test_sdk_contract');
  expect(request.data ? JSON.parse(request.data) : undefined).toEqual(body);
});

test('shipping and tax helpers preserve request parameters and calculated totals', async () => {
  const shipping = { valid: true, id: 'shipping_1', price: money(5), live };
  const tax = { valid: true, tax_region: 'US-MA', live };
  const { client, adapter } = createClient((config) => (
    config.url.endsWith('/check/shipping') ? shipping : tax
  ));
  const shippingParams = { shipping_option_id: 'shipping_1', country: 'US', region: 'MA' };
  const taxParams = { country: 'US', region: 'MA', postal_zip_code: '02108' };

  expect(await client.checkout.checkShippingOption('token_1', shippingParams)).toEqual(shipping);
  expect(await client.checkout.setTaxZone('token_1', taxParams)).toEqual(tax);
  expect(adapter.mock.calls.map(([config]) => ({ url: config.url, method: config.method, params: config.params }))).toEqual([
    { url: 'checkouts/token_1/check/shipping', method: 'get', params: shippingParams },
    { url: 'checkouts/token_1/helper/set_tax_zone', method: 'get', params: taxParams },
  ]);
});

test('capture returns the provider receipt and refreshes the SDK cart after success', async () => {
  const order = { id: 'order_1', customer_reference: 'ORDER-1', status_payment: 'paid' };
  const orderData = {
    line_items: cart.line_items,
    fulfillment: { shipping_method: 'shipping_1' },
    payment: { gateway: 'stripe', stripe: { payment_method_id: 'pm_fixture' } },
  };
  const { client, adapter } = createClient((config) => {
    if (config.url === 'checkouts/token_1' && config.method === 'post') return order;
    if (config.url === 'carts' && config.method === 'get') return { id: 'cart_new', total_items: 0, line_items: [] };
    throw new Error(`Unexpected transport request: ${config.method} ${config.url}`);
  });

  expect(await client.checkout.capture('token_1', orderData)).toEqual(order);

  expect(adapter).toHaveBeenCalledTimes(2);
  expect(JSON.parse(adapter.mock.calls[0][0].data)).toEqual(orderData);
  expect(adapter.mock.calls[1][0]).toEqual(expect.objectContaining({ url: 'carts', method: 'get' }));
});

test('capture rejects with the existing API error shape and does not refresh on failure', async () => {
  const payload = { error: { message: 'Payment declined.' } };
  const transportError = Object.assign(new Error('Request failed with status code 402'), {
    response: { status: 402, statusText: 'Payment Required', data: payload },
  });
  const { client, adapter } = createClient(() => { throw transportError; });

  await expect(client.checkout.capture('token_1', { payment: { gateway: 'stripe' } })).rejects.toMatchObject({
    statusCode: 402,
    data: payload,
    originalError: transportError,
  });
  expect(adapter).toHaveBeenCalledTimes(1);
});

test('preserves a network error without assuming an HTTP response exists', async () => {
  const networkError = Object.assign(new Error('Network unavailable'), { code: 'ERR_NETWORK' });
  const { client, adapter } = createClient(() => { throw networkError; });

  await expect(client.products.list()).rejects.toBe(networkError);
  expect(adapter).toHaveBeenCalledTimes(1);
});
