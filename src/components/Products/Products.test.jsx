import { fireEvent, render, screen } from '@testing-library/react';

import Products from './Products';

const products = ['Coffee', 'Tea'].map((name, index) => ({
  id: `product_${index + 1}`,
  name,
  description: `<p>${name} for your kitchen.</p>`,
  media: { source: '/product-fixture.png' },
  price: { formatted_with_symbol: '$10.00' },
}));

test('blocks every product add while the cart is updating and restores the actions afterward', () => {
  const onAddToCart = jest.fn();
  const view = render(<Products products={products} onAddToCart={onAddToCart} isUpdating />);

  for (const product of products) {
    const add = screen.getByRole('button', { name: `Add ${product.name} to cart` });
    expect(add).toBeDisabled();
    fireEvent.click(add);
  }
  expect(onAddToCart).not.toHaveBeenCalled();

  view.rerender(<Products products={products} onAddToCart={onAddToCart} />);
  const addTea = screen.getByRole('button', { name: 'Add Tea to cart' });
  expect(addTea).toBeEnabled();
  fireEvent.click(addTea);
  expect(onAddToCart).toHaveBeenCalledWith('product_2', 1);
});
