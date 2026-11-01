import { notFound } from 'next/navigation';
import { usesSeededCatalog } from '../../../lib/storefront-config';
import { catalog } from '../../../lib/demo/catalog';

// Reject unknown local fixtures before the loading boundary starts streaming,
// preserving a real HTTP 404 on a direct demo URL.
export default async function ProductLayout({ children, params }) {
  const { slug } = await params;
  if (usesSeededCatalog && !catalog.some((product) => product.permalink === slug || product.id === slug)) notFound();
  return children;
}
