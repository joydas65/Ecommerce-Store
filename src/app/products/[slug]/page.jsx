import { notFound } from 'next/navigation';
import { getProduct } from '../../../lib/product-reader';
import { isDemoMode } from '../../../lib/commerce-mode';
import { catalog } from '../../../lib/demo/catalog';
import ProductDetail from '../../../components/ProductDetail/ProductDetail';
import ProductUnavailable from '../../../components/ProductDetail/ProductUnavailable';

export function generateStaticParams() {
  return isDemoMode ? catalog.map(({ permalink }) => ({ slug: permalink })) : [];
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const result = await getProduct(slug);
  if (result.status !== 'ready') return {
    title: result.status === 'not-found' ? 'Product not found' : 'Product unavailable',
    robots: { index: false, follow: true },
  };
  return {
    title: result.product.name,
    description: result.product.details?.overview || result.product.description || `Explore ${result.product.name} at Joy's Store.`,
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const result = await getProduct(slug);
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') return <ProductUnavailable />;
  return <ProductDetail product={result.product} />;
}
