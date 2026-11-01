import { render, screen } from '@testing-library/react';

import ProductNotFound from './ProductNotFound';

test('explains a missing product and provides a working route back to the catalog', () => {
  render(<ProductNotFound />);

  expect(screen.getByRole('heading', { level: 1, name: 'Product not found' })).toBeInTheDocument();
  expect(screen.getByText('This product may have moved or is no longer available.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', '/#products');
  expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument();
});
