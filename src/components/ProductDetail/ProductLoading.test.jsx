import { render, screen } from '@testing-library/react';

import ProductLoading from './ProductLoading';

test('announces loading while keeping an accessible page heading', () => {
  render(<ProductLoading />);

  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('heading', { level: 1, name: 'Loading product' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('status')).toHaveTextContent('Getting the product details ready…');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
