import { createDemoCommerce, DEMO_CART_STORAGE_KEY } from './commerce';

function storageFixture(initial) {
  const data = new Map(initial ? [[DEMO_CART_STORAGE_KEY, initial]] : []);
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

const create = (storage = storageFixture()) => createDemoCommerce({ storage, delayMs: 0 });
const orderData = (failOnce = false) => ({
  customer: { firstname: 'Alex', lastname: 'Example', email: 'alex@example.com' },
  shipping: { name: 'Alex Example', street: '123 Sample Street', town_city: 'San Francisco', county_state: 'CA', postal_zip_code: '94103', country: 'US' },
  fulfillment: { shipping_method: 'demo-standard' },
  payment: { gateway: 'demo', demo: { failOnce } },
});

async function checkout(client, option = 'demo-standard') {
  const cart = await client.cart.retrieve();
  const token = await client.checkout.generateToken(cart.id, { type: 'cart' });
  await client.checkout.checkShippingOption(token.id, { shipping_option_id: option, country: 'US', region: 'CA' });
  const { live } = await client.checkout.setTaxZone(token.id, { country: 'US', region: 'CA', postal_zip_code: '94103' });
  return { ...token, live };
}

test('serves six local products and persists cart changes across provider instances', async () => {
  const storage = storageFixture();
  const client = create(storage);
  const { data } = await client.products.list();
  expect(data).toHaveLength(6);
  expect(data.every((product) => product.media.source.startsWith('/demo/'))).toBe(true);

  await client.cart.add('demo-desk-mat', 2);
  const { cart } = await client.cart.add('demo-notebook', 1);
  const restored = await create(storage).cart.retrieve();
  expect(restored).toEqual(cart);
  expect(restored.subtotal.raw).toBe(80);
  expect(restored.total_items).toBe(3);

  await client.cart.update('line-demo-desk-mat', { quantity: 3 });
  await client.cart.remove('line-demo-notebook');
  expect((await client.cart.retrieve()).subtotal.raw).toBe(102);
  await client.cart.update('line-demo-desk-mat', { quantity: 0 });
  expect((await client.cart.retrieve()).line_items).toEqual([]);
  await client.cart.add('demo-bottle', 1);
  expect((await client.cart.empty()).cart.total_items).toBe(0);
});

test.each([0, -1, 1.5, 100, NaN, '2'])('rejects invalid add quantity %s without changing the cart', async (quantity) => {
  const client = create();
  await client.cart.add('demo-notebook', 1);
  const before = await client.cart.retrieve();
  await expect(client.cart.add('demo-notebook', quantity)).rejects.toThrow();
  expect(await client.cart.retrieve()).toEqual(before);
});

test('rejects unknown products and limits the combined quantity', async () => {
  const client = create();
  await expect(client.cart.add('unknown', 1)).rejects.toThrow();
  await client.cart.add('demo-notebook', 99);
  await expect(client.cart.add('demo-notebook', 1)).rejects.toThrow(/99/);
  await expect(client.cart.update('line-demo-notebook', { quantity: -1 })).rejects.toThrow();
  expect((await client.cart.retrieve()).total_items).toBe(99);
});

test.each([
  ['demo-standard', 5, 3.12, 42.12],
  ['demo-express', 12, 3.68, 49.68],
])('calculates %s shipping and sample tax from integer cents', async (option, shipping, tax, total) => {
  const client = create();
  await client.cart.add('demo-desk-mat', 1);
  const token = await checkout(client, option);
  expect(token.live.subtotal.raw).toBe(34);
  expect(token.live.shipping.price.raw).toBe(shipping);
  expect(token.live.tax.amount.raw).toBe(tax);
  expect(token.live.total_with_tax.raw).toBe(total);
});

test('supports countries without regions and validates shipping selections', async () => {
  const client = create();
  await client.cart.add('demo-notebook', 1);
  const token = await checkout(client);
  expect((await client.services.localeListShippingCountries(token.id)).countries.SG).toBe('Singapore');
  expect(await client.services.localeListSubdivisions('GB')).toEqual({ subdivisions: {} });
  expect(await client.checkout.getShippingOptions(token.id, { country: 'SG' })).toHaveLength(2);
  await expect(client.checkout.getShippingOptions(token.id, { country: 'US', region: 'invalid' })).rejects.toThrow();
  await expect(client.checkout.checkShippingOption(token.id, { country: 'SG', shipping_option_id: 'free' })).rejects.toThrow();
  await client.checkout.checkShippingOption(token.id, { country: 'SG', shipping_option_id: 'demo-standard' });
  await expect(client.checkout.setTaxZone(token.id, { country: 'US', region: 'CA', postal_zip_code: '94103' })).rejects.toThrow();
  await expect(client.checkout.setTaxZone(token.id, { country: 'SG', postal_zip_code: '123456' })).resolves.toMatchObject({ valid: true });
});

test('requires a nonempty cart, current snapshot, shipping and a simulated payment', async () => {
  const client = create();
  const empty = await client.cart.retrieve();
  await expect(client.checkout.generateToken(empty.id, { type: 'cart' })).rejects.toThrow(/Add a product/);
  await client.cart.add('demo-desk-mat', 1);
  const cart = await client.cart.retrieve();
  const unpriced = await client.checkout.generateToken(cart.id, { type: 'cart' });
  await expect(client.checkout.capture(unpriced.id, orderData())).rejects.toThrow(/Review your shipping/);
  const token = await checkout(client);
  await expect(client.checkout.capture(token.id, { ...orderData(), payment: { gateway: 'stripe' } })).rejects.toThrow(/simulated payments/);
  await client.cart.add('demo-notebook', 1);
  await expect(client.checkout.capture(token.id, orderData())).rejects.toThrow(/cart changed/);
  expect((await client.cart.retrieve()).total_items).toBe(2);
});

test('detects a cart change made by another provider instance', async () => {
  const storage = storageFixture();
  const client = create(storage);
  await client.cart.add('demo-notebook', 1);
  const token = await checkout(client);
  await create(storage).cart.add('demo-tote', 1);
  await expect(client.checkout.capture(token.id, orderData())).rejects.toThrow(/cart changed/);
});

test.each(['removeItem', 'clear'])('respects an external storage %s without resurrecting the previous cart', async (operation) => {
  const storage = storageFixture();
  const client = create(storage);
  const { cart: before } = await client.cart.add('demo-notebook', 2);
  const token = await checkout(client);

  storage[operation](DEMO_CART_STORAGE_KEY);
  const after = await client.cart.retrieve();

  expect(after.id).not.toBe(before.id);
  expect(after.total_items).toBe(0);
  expect(await client.cart.retrieve()).toEqual(after);
  expect(await create(storage).cart.retrieve()).toEqual(after);
  await expect(client.checkout.capture(token.id, orderData())).rejects.toThrow(/cart changed/);
});

test('keeps the cart after one simulated failure, then confirms and clears it on retry', async () => {
  const storage = storageFixture();
  const client = create(storage);
  await client.cart.add('demo-desk-mat', 1);
  const before = await client.cart.retrieve();
  const token = await checkout(client);

  await expect(client.checkout.capture(token.id, orderData(true))).rejects.toThrow(/Simulated payment failure/);
  expect(await client.cart.retrieve()).toEqual(before);
  const receipt = await client.checkout.capture(token.id, orderData(true));
  expect(receipt).toMatchObject({ id: expect.stringMatching(/^DEMO-/), demo: true, status_payment: 'paid', customer: { firstname: 'Alex' } });
  expect(receipt.live.total_with_tax.raw).toBe(42.12);
  const after = await create(storage).cart.retrieve();
  expect(after.id).not.toBe(before.id);
  expect(after.total_items).toBe(0);
  expect(await client.cart.refresh()).toEqual(after);

  const persisted = storage.getItem(DEMO_CART_STORAGE_KEY);
  for (const personalData of ['Alex', 'alex@example.com', '123 Sample Street', '94103', receipt.id]) expect(persisted).not.toContain(personalData);
  expect(Object.keys(JSON.parse(persisted)).sort()).toEqual(['id', 'items', 'revision']);
});

test('repeated capture returns the same receipt without clearing a subsequent cart', async () => {
  const client = create();
  await client.cart.add('demo-desk-mat', 1);
  const token = await checkout(client);
  const receipts = await Promise.all([client.checkout.capture(token.id, orderData()), client.checkout.capture(token.id, orderData())]);
  expect(receipts[0]).toEqual(receipts[1]);
  await client.cart.add('demo-notebook', 1);
  expect(await client.checkout.capture(token.id, orderData())).toEqual(receipts[0]);
  expect((await client.cart.retrieve()).total_items).toBe(1);
});

test.each(['not json', JSON.stringify({ id: 'demo-cart-bad', revision: 0, items: [{ productId: 'demo-notebook', quantity: -2 }] })])('recovers from malformed persisted state', async (saved) => {
  const client = create(storageFixture(saved));
  expect((await client.cart.retrieve()).total_items).toBe(0);
  expect((await client.cart.add('demo-notebook', 1)).cart.subtotal.raw).toBe(12);
});

test('falls back to memory if browser storage is denied or unavailable', async () => {
  const client = create({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
  await client.cart.add('demo-notebook', 2);
  expect((await client.cart.retrieve()).total_items).toBe(2);
  const token = await checkout(client);
  await expect(client.checkout.capture(token.id, orderData())).resolves.toMatchObject({ demo: true });
});

test('does not leak extra persisted fields or return mutable internal objects', async () => {
  const storage = storageFixture(JSON.stringify({ id: 'demo-cart-restored', revision: 0, items: [{ productId: 'demo-notebook', quantity: 1 }], email: 'private@example.com' }));
  const client = create(storage);
  const cart = await client.cart.retrieve();
  cart.line_items[0].quantity = 99;
  expect((await client.cart.retrieve()).total_items).toBe(1);
  expect(storage.getItem(DEMO_CART_STORAGE_KEY)).not.toContain('private@example.com');
});
