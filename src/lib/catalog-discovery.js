import { plainProductText } from './product-text';

export const MAX_QUERY_LENGTH = 120;

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A–Z' },
];

export const normalizeQuery = (query) => typeof query === 'string'
  ? query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH).trim()
  : '';

const normalizeSort = (sort) => SORT_OPTIONS.some((option) => option.value === sort) ? sort : 'featured';

export const readCatalogQuery = (searchParams) => ({
  query: normalizeQuery(searchParams.get('q')),
  sort: normalizeSort(searchParams.get('sort')),
});

export const catalogHref = (currentSearchParams, { query, sort }) => {
  const params = new URLSearchParams(currentSearchParams.toString());
  const normalizedQuery = normalizeQuery(query);
  const normalizedSort = normalizeSort(sort);
  params.delete('q');
  params.delete('sort');
  if (normalizedQuery) params.set('q', normalizedQuery);
  if (normalizedSort !== 'featured') params.set('sort', normalizedSort);
  const serialized = params.toString();
  return `/${serialized ? `?${serialized}` : ''}#products`;
};

const searchable = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
const nameOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const productText = (product) => {
  const details = product.details;
  const fields = [product.name, product.description, details?.overview, details?.care];
  if (Array.isArray(details?.features)) fields.push(...details.features);
  if (Array.isArray(details?.specifications)) {
    fields.push(...details.specifications.flatMap((specification) => [specification?.label, specification?.value]));
  }
  return searchable(fields.map(plainProductText).join(' '));
};

const compareNames = (left, right) => {
  const nameComparison = nameOrder.compare(plainProductText(left.name), plainProductText(right.name));
  if (nameComparison) return nameComparison;
  const leftId = String(left.id ?? '');
  const rightId = String(right.id ?? '');
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

const validPrice = (product) => typeof product.price?.raw === 'number'
  && Number.isFinite(product.price.raw) && product.price.raw >= 0;

// Search and sort the loaded catalog without mutating the provider's shared data.
// Query tokens are literal substrings, never a regular expression from the URL.
export const searchProducts = (products, { query = '', sort = 'featured' } = {}) => {
  const tokens = searchable(normalizeQuery(query)).split(' ').filter(Boolean);
  const matches = products.filter((product) => {
    if (!tokens.length) return true;
    const text = productText(product);
    return tokens.every((token) => text.includes(token));
  });
  const normalizedSort = normalizeSort(sort);
  if (normalizedSort === 'featured') return matches;
  if (normalizedSort === 'name-asc') return matches.sort(compareNames);

  return matches.sort((left, right) => {
    const leftValid = validPrice(left);
    const rightValid = validPrice(right);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    const difference = leftValid ? left.price.raw - right.price.raw : 0;
    if (difference) return normalizedSort === 'price-asc' ? difference : -difference;
    return compareNames(left, right);
  });
};
