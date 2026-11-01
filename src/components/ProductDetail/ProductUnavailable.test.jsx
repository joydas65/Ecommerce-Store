import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

import ProductUnavailable from './ProductUnavailable';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

test('announces a temporary failure and allows refreshing product data or returning to the catalog', async () => {
  const user = userEvent.setup();
  const refresh = jest.fn();
  useRouter.mockReturnValue({ refresh });
  render(<ProductUnavailable />);

  expect(screen.getByRole('heading', { level: 1, name: 'Product unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load this product right now.");
  expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', '/#products');
  expect(refresh).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(refresh).toHaveBeenCalledTimes(1);
});
