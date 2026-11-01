import { catalog, productDetails } from './demo/catalog';
import { catalogHref, MAX_QUERY_LENGTH, normalizeQuery, readCatalogQuery, searchProducts } from './catalog-discovery';

const products = catalog.map(productDetails);
const names = (items) => items.map(({ name }) => name);
const search = (query, sort = 'featured') => names(searchProducts(products, { query, sort }));

test('reads a shared URL with normalized query and an allowed sort', () => {
  expect(readCatalogQuery(new URLSearchParams('q=++Desk+++mat++&sort=price-desc')))
    .toEqual({ query: 'Desk mat', sort: 'price-desc' });
});

test.each(['', 'sort=unsupported', 'q=+++&sort=__proto__', 'sort=constructor'])('unrecognized URL options use safe defaults: %s', (params) => {
  expect(readCatalogQuery(new URLSearchParams(params))).toEqual({ query: '', sort: 'featured' });
});

test('resolves duplicate managed URL parameters consistently and keeps the caller untouched', () => {
  const params = new URLSearchParams('q=desk&q=bottle&sort=price-asc&sort=price-desc&campaign=desk&campaign=gift');
  expect(readCatalogQuery(params)).toEqual({ query: 'desk', sort: 'price-asc' });
  const href = catalogHref(params, { query: '  Felt  mat ', sort: 'name-asc' });
  const target = new URL(href, 'https://store.example');
  expect(target.pathname).toBe('/');
  expect(target.hash).toBe('#products');
  expect(target.searchParams.getAll('q')).toEqual(['Felt mat']);
  expect(target.searchParams.getAll('sort')).toEqual(['name-asc']);
  expect(target.searchParams.getAll('campaign')).toEqual(['desk', 'gift']);
  expect(params.getAll('q')).toEqual(['desk', 'bottle']);
});

test('removes blank search and default or invalid sort from generated URLs', () => {
  expect(catalogHref(new URLSearchParams('q=desk&q=mat&sort=price-asc'), { query: '  ', sort: 'featured' })).toBe('/#products');
  expect(catalogHref(new URLSearchParams('utm_source=demo&sort=invalid'), { query: '', sort: 'invalid' })).toBe('/?utm_source=demo#products');
});

test('encodes query values as data and round-trips reserved URL characters', () => {
  const query = '<script>alert(1)</script> & /?q=other#products';
  const href = catalogHref(new URLSearchParams(), { query, sort: 'featured' });
  expect(href).not.toContain('<script>');
  const target = new URL(href, 'https://store.example');
  expect(target.origin).toBe('https://store.example');
  expect([...target.searchParams.keys()]).toEqual(['q']);
  expect(readCatalogQuery(target.searchParams)).toEqual({ query, sort: 'featured' });
});

test('bounds query length after whitespace normalization', () => {
  expect(normalizeQuery(` \t${'x'.repeat(MAX_QUERY_LENGTH + 100)}  \n`)).toHaveLength(MAX_QUERY_LENGTH);
  expect(normalizeQuery('  laptop\n\t stand  ')).toBe('laptop stand');
  expect(normalizeQuery(null)).toBe('');
  expect(normalizeQuery(['desk', 'mat'])).toBe('');
});

test('searches every term across a product name and its useful content without case sensitivity', () => {
  expect(search('  DESK   felt ')).toEqual(['Desk Mat']);
  expect(search('USB-C lamp')).toEqual(['Desk Lamp']);
  expect(search('cork materials')).toEqual(['Desk Mat']);
  expect(search('brush dry')).toEqual(['Desk Mat']);
  expect(search('laptop ribbon')).toEqual([]);
});

test('matches visible HTML text and common entities without indexing markup or hidden code', () => {
  const merchantProducts = [{
    id: 'merchant', name: 'Café Notebook',
    description: '<!-- secret-comment --><script>hidden-script</script><style>hidden-style</style><p class="internal-class">Résumé&nbsp;&amp; notes &#233; &#x2713;</p>',
  }];
  expect(searchProducts(merchantProducts, { query: 'cafe resume notes' })).toHaveLength(1);
  expect(searchProducts(merchantProducts, { query: '& e ✓' })).toHaveLength(1);
  for (const query of ['internal-class', 'hidden-script', 'hidden-style', 'secret-comment', 'nbsp', 'class=']) {
    expect(searchProducts(merchantProducts, { query })).toEqual([]);
  }
});

test('treats regex punctuation literally and handles missing optional product content', () => {
  const minimal = [{ id: 'one', name: 'Notebook (A5)', price: { raw: 12 } }];
  expect(searchProducts(minimal, { query: '(a5)' })).toEqual(minimal);
  expect(searchProducts(minimal, { query: '.*' })).toEqual([]);
  expect(searchProducts(minimal, { query: '[' })).toEqual([]);
});

test('featured search preserves the source order and never mutates the shared catalog', () => {
  const frozen = Object.freeze([...products]);
  const before = JSON.stringify(products);
  expect(search('desk')).toEqual(['Desk Mat', 'Bottle', 'Laptop Stand', 'Desk Lamp']);
  expect(searchProducts(frozen, {})).not.toBe(frozen);
  searchProducts(frozen, { query: 'desk', sort: 'price-desc' });
  expect(JSON.stringify(products)).toBe(before);
  expect(searchProducts(frozen, { sort: 'bad-sort' })).toEqual(products);
});

test('sorts the full and filtered catalog by numeric price and natural product name', () => {
  expect(search('', 'price-asc')).toEqual(['Notebook', 'Tote', 'Bottle', 'Desk Mat', 'Laptop Stand', 'Desk Lamp']);
  expect(search('', 'price-desc')).toEqual(['Desk Lamp', 'Laptop Stand', 'Desk Mat', 'Bottle', 'Tote', 'Notebook']);
  expect(search('', 'name-asc')).toEqual(['Bottle', 'Desk Lamp', 'Desk Mat', 'Laptop Stand', 'Notebook', 'Tote']);
  expect(search('desk', 'price-asc')).toEqual(['Bottle', 'Desk Mat', 'Laptop Stand', 'Desk Lamp']);
});

test.each(['price-asc', 'price-desc'])('price sorting puts missing or invalid prices last and resolves ties by name then id: %s', (sort) => {
  const input = [
    { id: 'missing', name: 'Missing' },
    { id: 'beta', name: 'Beta', price: { raw: 10, formatted_with_symbol: '$0.01' } },
    { id: 'a2', name: 'Alpha', price: { raw: 10 } },
    { id: 'a1', name: 'Alpha', price: { raw: 10 } },
    { id: 'zero', name: 'Zero', price: { raw: 0, formatted_with_symbol: '$999' } },
    { id: 'invalid', name: 'Invalid', price: { raw: NaN } },
    { id: 'negative', name: 'Negative', price: { raw: -1 } },
    { id: 'infinite', name: 'Infinite', price: { raw: Infinity } },
    { id: 'string', name: 'String', price: { raw: '5' } },
  ];
  const ids = searchProducts(input, { sort }).map(({ id }) => id);
  expect(ids).toEqual([
    ...(sort === 'price-asc' ? ['zero', 'a1', 'a2', 'beta'] : ['a1', 'a2', 'beta', 'zero']),
    'infinite', 'invalid', 'missing', 'negative', 'string',
  ]);
  expect(input[0].id).toBe('missing');
});

test('name sorting is deterministic for accented, numeric, and equal names', () => {
  const items = [
    { id: 'cafe-z', name: 'Café' }, { id: 'pad10', name: 'Pad 10' },
    { id: 'cafe-a', name: 'Cafe' }, { id: 'pad2', name: 'Pad 2' },
  ];
  expect(searchProducts(items, { sort: 'name-asc' }).map(({ id }) => id)).toEqual(['cafe-a', 'cafe-z', 'pad2', 'pad10']);
});
