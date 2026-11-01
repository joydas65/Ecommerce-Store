import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { getProduct } from '../../lib/product-reader';
import { catalog, productDetails } from '../../lib/demo/catalog';
import ProductPage, { generateMetadata, generateStaticParams } from './[slug]/page';
import ProductLayout from './[slug]/layout';
import ProductLoading from './[slug]/loading';
import ProductNotFound from './not-found';

let mockSeededCatalog = true;

jest.mock('../../lib/storefront-config', () => ({ get usesSeededCatalog() { return mockSeededCatalog; } }));
jest.mock('../../lib/product-reader', () => ({ getProduct: jest.fn() }));
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); }),
  useRouter: () => ({ refresh: jest.fn() }),
}));
// The purchase flow has its own interaction tests. Here the server route must
// deliver useful product information independently of the browser cart context.
jest.mock('../../components/ProductDetail/ProductPurchase', () => function Purchase() {
  return <button type="button">Add to cart</button>;
});

const product = productDetails(catalog[0]);
const route = (slug = product.permalink) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  mockSeededCatalog = true;
  getProduct.mockResolvedValue({ status: 'ready', product });
});

test('prebuilds every demo permalink and leaves live merchant routes to request-time reads', () => {
  expect(generateStaticParams()).toEqual(catalog.map(({ permalink }) => ({ slug: permalink })));
  mockSeededCatalog = false;
  expect(generateStaticParams()).toEqual([]);
});

test('waits for route params before reading and renders useful product content', async () => {
  let resolveParams;
  const params = new Promise((resolve) => { resolveParams = resolve; });
  const page = ProductPage({ params });
  expect(getProduct).not.toHaveBeenCalled();

  resolveParams({ slug: 'desk-mat' });
  render(await page);

  expect(getProduct).toHaveBeenCalledWith('desk-mat');
  expect(screen.getByRole('heading', { level: 1, name: 'Desk Mat' })).toBeInTheDocument();
  expect(screen.getByText('$34.00')).toBeInTheDocument();
  expect(screen.getByText(product.details.overview)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Specifications' })).toBeInTheDocument();
  expect(screen.getByText('75 × 35 cm')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Desk Mat' })).toHaveAttribute('src', '/demo/desk-mat.svg');
  expect(notFound).not.toHaveBeenCalled();
});

test('missing products reach the Next not-found boundary rather than an unavailable page', async () => {
  getProduct.mockResolvedValue({ status: 'not-found' });
  await expect(ProductPage(route('missing-product'))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(notFound).toHaveBeenCalledTimes(1);
});

test('unavailable products render a recoverable error without calling notFound', async () => {
  getProduct.mockResolvedValue({ status: 'unavailable' });
  render(await ProductPage(route()));
  expect(screen.getByRole('heading', { level: 1, name: 'Product unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load this product right now.");
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', '/#products');
  expect(notFound).not.toHaveBeenCalled();
});

test('metadata awaits the route slug and describes the requested demo product', async () => {
  expect(await generateMetadata(route())).toEqual({
    title: product.name, description: product.details.overview,
  });
  expect(getProduct).toHaveBeenCalledWith(product.permalink);
});

test('merchant metadata uses the provided description and has a readable fallback', async () => {
  getProduct.mockResolvedValueOnce({ status: 'ready', product: { ...product, details: undefined, description: 'Merchant description' } });
  expect(await generateMetadata(route())).toEqual({ title: product.name, description: 'Merchant description' });

  getProduct.mockResolvedValueOnce({ status: 'ready', product: { ...product, details: undefined, description: '' } });
  expect(await generateMetadata(route())).toEqual({ title: product.name, description: "Explore Desk Mat at Joy's Store." });
});

test.each([
  ['not-found', 'Product not found'],
  ['unavailable', 'Product unavailable'],
])('%s metadata avoids indexing an error page without mislabeling its cause', async (status, title) => {
  getProduct.mockResolvedValue({ status });
  expect(await generateMetadata(route())).toEqual({ title, robots: { index: false, follow: true } });
  expect(notFound).not.toHaveBeenCalled();
});

test.each(['desk-mat', 'demo-desk-mat'])('the demo layout accepts known identifiers: %s', async (slug) => {
  const children = <main>Product content</main>;
  expect(await ProductLayout({ ...route(slug), children })).toBe(children);
  expect(notFound).not.toHaveBeenCalled();
  expect(getProduct).not.toHaveBeenCalled();
});

test('the demo layout rejects an unknown slug before rendering its loading boundary', async () => {
  await expect(ProductLayout({ ...route('missing-product'), children: <main>Product content</main> }))
    .rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(notFound).toHaveBeenCalledTimes(1);
  expect(getProduct).not.toHaveBeenCalled();
});

test('live mode bypasses the demo layout guard so merchant products can be resolved', async () => {
  mockSeededCatalog = false;
  const children = <main>Merchant content</main>;
  expect(await ProductLayout({ ...route('merchant-only-product'), children })).toBe(children);
  expect(notFound).not.toHaveBeenCalled();
});

test('the parent not-found component gives product-specific recovery', () => {
  render(<ProductNotFound />);
  expect(screen.getByRole('heading', { level: 1, name: 'Product not found' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', '/#products');
});

test('the route loading state announces progress without presenting fake product data', () => {
  render(<ProductLoading />);
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('heading', { level: 1, name: 'Loading product' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Getting the product details ready…');
  expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
});
