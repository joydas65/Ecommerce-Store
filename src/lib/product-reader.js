import 'server-only';
import { cache } from 'react';
import { isDemoMode } from './commerce-mode';
import { catalog, productDetails } from './demo/catalog';

const validIdentifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// Merchant descriptions may contain HTML. These values are rendered as text,
// never as HTML; removing markup also keeps metadata readable without a DOM.
const plainText = (value) => {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
      if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? entity;
      const hexadecimal = code[1].toLowerCase() === 'x';
      const point = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
};

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
  if (!product || !validIdentifier(product.id) || !plainText(product.name)
    || typeof product.price?.raw !== 'number' || !Number.isFinite(product.price.raw)
    || product.price.raw < 0 || !plainText(product.price.formatted_with_symbol)) return null;

  return {
    id: product.id,
    name: plainText(product.name),
    permalink: validIdentifier(product.permalink) ? product.permalink : slug,
    description: plainText(product.description),
    price: {
      raw: product.price.raw,
      formatted_with_symbol: plainText(product.price.formatted_with_symbol),
    },
    media: { source: imageSource(product.media?.source) },
  };
};

export async function loadProduct(slug, {
  demoMode = isDemoMode,
  publicKey = process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!validIdentifier(slug)) return { status: 'not-found' };

  if (demoMode) {
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
