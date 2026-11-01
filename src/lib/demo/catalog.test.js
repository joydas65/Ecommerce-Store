import { catalog, productDetails } from './catalog';

test('keeps existing product identities and prices while assigning unique stable links', () => {
  expect(catalog.map(({ id, cents, permalink }) => [id, cents, permalink])).toEqual([
    ['demo-desk-mat', 3400, 'desk-mat'],
    ['demo-notebook', 1200, 'notebook'],
    ['demo-bottle', 2800, 'bottle'],
    ['demo-tote', 2200, 'tote'],
    ['demo-laptop-stand', 4800, 'laptop-stand'],
    ['demo-desk-lamp', 6400, 'desk-lamp'],
  ]);
  expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
  expect(new Set(catalog.map(({ permalink }) => permalink)).size).toBe(catalog.length);
});

test.each(catalog)('$name has portable, useful detail content and a local illustration', (product) => {
  const detail = productDetails(product);
  expect(detail.permalink).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  expect(detail.media.source).toMatch(/^\/demo\/[a-z-]+\.svg$/);
  expect(detail.price.raw).toBe(product.cents / 100);
  expect(detail.details.overview.trim()).not.toBe('');
  expect(detail.details.care.trim()).not.toBe('');
  expect(detail.details.features.length).toBeGreaterThanOrEqual(3);
  expect(detail.details.features.every((feature) => typeof feature === 'string' && feature.trim())).toBe(true);
  expect(detail.details.specifications.length).toBeGreaterThanOrEqual(3);
  const labels = detail.details.specifications.map(({ label, value }) => {
    expect(typeof label).toBe('string');
    expect(typeof value).toBe('string');
    expect(label.trim()).not.toBe('');
    expect(value.trim()).not.toBe('');
    return label;
  });
  expect(new Set(labels).size).toBe(labels.length);
  expect(JSON.parse(JSON.stringify(detail))).toEqual(detail);
});

test('a consumer cannot mutate the shared detail fixtures through a product response', () => {
  const original = productDetails(catalog[0]);
  const changed = productDetails(catalog[0]);
  changed.details.overview = 'Changed';
  changed.details.features.push('Changed');
  changed.details.specifications[0].value = 'Changed';
  changed.details.specifications.push({ label: 'Changed', value: 'Changed' });
  changed.details.care = 'Changed';

  expect(productDetails(catalog[0])).toEqual(original);
});
