import { render, screen, within } from '@testing-library/react';

import { catalog, productDetails } from '../../lib/demo/catalog';
import ProductDetail from './ProductDetail';

jest.mock('./ProductPurchase', () => function ProductPurchase({ product }) {
  return <button type="button">Add to cart: {product.name}</button>;
});

const demoProduct = productDetails(catalog[0]);
const merchantProduct = {
  id: 'merchant-product', name: 'Merchant notebook',
  price: { formatted_with_symbol: '$18.00' },
  media: { source: 'https://example.com/notebook.jpg' },
  description: 'A plain notebook for everyday notes.',
};

test('presents useful demo information, the price, and clear sample content disclosure', () => {
  render(<ProductDetail product={demoProduct} />);

  expect(screen.getByRole('heading', { level: 1, name: demoProduct.name })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: demoProduct.name })).toHaveAttribute('src', demoProduct.media.source);
  expect(screen.getByText(demoProduct.price.formatted_with_symbol)).toBeInTheDocument();
  expect(screen.getByText(demoProduct.details.overview)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `Add to cart: ${demoProduct.name}` })).toBeInTheDocument();

  const features = screen.getByRole('region', { name: 'Why it works' });
  expect(within(features).getByRole('list')).toHaveTextContent(demoProduct.details.features[0]);
  expect(within(features).getByRole('heading', { level: 2, name: 'Care' })).toBeInTheDocument();
  expect(within(features).getByText(demoProduct.details.care)).toBeInTheDocument();
  const specifications = screen.getByRole('region', { name: 'Specifications' });
  expect(within(specifications).getByText(demoProduct.details.specifications[0].label)).toBeInTheDocument();
  expect(within(specifications).getByText(demoProduct.details.specifications[0].value)).toBeInTheDocument();
  expect(screen.getByText(/Specifications and illustrations are sample content/)).toBeInTheDocument();
  expect(screen.getByText('Shipping and tax are shown at checkout before you place your order.')).toBeInTheDocument();
});

test('offers catalog navigation and identifies the current product in the breadcrumb', () => {
  render(<ProductDetail product={demoProduct} />);

  const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(breadcrumb).getByRole('link', { name: 'All products' })).toHaveAttribute('href', '/#products');
  expect(within(breadcrumb).getByText(demoProduct.name)).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Explore the full collection' })).toHaveAttribute('href', '/#products');
});

test('uses merchant information without inventing sample specifications or care instructions', () => {
  render(<ProductDetail product={merchantProduct} />);

  expect(screen.getByRole('heading', { level: 1, name: merchantProduct.name })).toBeInTheDocument();
  expect(screen.getByText(merchantProduct.description)).toBeInTheDocument();
  expect(screen.getByText('$18.00')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Why it works' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Specifications' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Care' })).not.toBeInTheDocument();
  expect(screen.queryByText(/sample content/)).not.toBeInTheDocument();
});

test('keeps a product usable when its image and description are missing', () => {
  render(<ProductDetail product={{ ...merchantProduct, media: { source: '' }, description: '' }} />);

  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Product image unavailable')).toBeInTheDocument();
  expect(screen.getByText('More product information is coming soon.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `Add to cart: ${merchantProduct.name}` })).toBeInTheDocument();
});
