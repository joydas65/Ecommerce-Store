import 'server-only';
import { cache } from 'react';
import { catalogProvider as configuredCatalogProvider } from './storefront-config';
import { catalog, productDetails } from './demo/catalog';
import { plainProductText } from './product-text';

const validIdentifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const imageSource = (source) => {
  if (typeof source !== 'string') return '';
  try {
    const url = new URL(source);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const normalizeProduct = (product, slug) => {
  if (!product || !validIdentifier(product.id) || !plainProductText(product.name)
    || typeof product.price?.raw !== 'number' || !Number.isFinite(product.price.raw)
    || product.price.raw < 0 || !plainProductText(product.price.formatted_with_symbol)) return null;

  return {
    id: product.id,
    name: plainProductText(product.name),
    permalink: validIdentifier(product.permalink) ? product.permalink : slug,
    description: plainProductText(product.description),
    price: {
      raw: product.price.raw,
      formatted_with_symbol: plainProductText(product.price.formatted_with_symbol),
    },
    media: { source: imageSource(product.media?.source) },
  };
};

export async function loadProduct(slug, {
  catalogProvider = configuredCatalogProvider,
  publicKey = process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!validIdentifier(slug)) return { status: 'not-found' };

  if (catalogProvider === 'seeded') {
    const product = catalog.find((item) => item.permalink === slug || item.id === slug);
    return product ? { status: 'ready', product: productDetails(product) } : { status: 'not-found' };
  }

  if (typeof publicKey !== 'string' || !publicKey.trim() || typeof fetchImpl !== 'function') {
    return { status: 'unavailable' };
  }

  try {
    const url = new URL(`https://api.chec.io/v1/products/${encodeURIComponent(slug)}`);
    if (!slug.startsWith('prod_')) url.searchParams.set('type', 'permalink');
    const response = await fetchImpl(url.href, {
      method: 'GET',
      headers: { 'X-Authorization': publicKey.trim() },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    const product = normalizeProduct(await response.json(), slug);
    return product ? { status: 'ready', product } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

// Deduplicates page/metadata reads within one server render, without persisting
// merchant availability or prices between requests.
export const getProduct = cache(loadProduct);
