import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Products from './Products';

const products = ['Coffee', 'Tea'].map((name, index) => ({
  id: `product_${index + 1}`,
  name,
  description: `<p>${name} for your kitchen.</p>`,
  media: { source: '/product-fixture.png' },
  price: { formatted_with_symbol: '$10.00' },
}));

const addButton = (name) => screen.getByRole('button', { name: `Add to cart: ${name}`, exact: true });
const confirmed = { status: 'success', cart: { id: 'cart_1', total_items: 1 } };

test('blocks every product add during an existing cart update, then restores the actions', async () => {
  const user = userEvent.setup();
  const onAddToCart = jest.fn().mockResolvedValue(confirmed);
  const view = render(<Products products={products} onAddToCart={onAddToCart} isUpdating />);

  for (const product of products) {
    expect(addButton(product.name)).toBeDisabled();
    fireEvent.click(addButton(product.name));
  }
  expect(onAddToCart).not.toHaveBeenCalled();

  view.rerender(<Products products={products} onAddToCart={onAddToCart} />);
  await user.click(addButton('Tea'));
  expect(onAddToCart).toHaveBeenCalledWith('product_2', 1);
  expect(screen.getByRole('status')).toHaveTextContent('Tea added to your cart.');
});

test('waits for a confirmed add, blocks repeat attempts, and provides a cart destination', async () => {
  let finish;
  const onAddToCart = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  render(<Products products={products} onAddToCart={onAddToCart} />);

  fireEvent.click(addButton('Coffee'));
  const pendingButton = screen.getByRole('button', { name: 'Adding… Coffee' });
  expect(pendingButton).toHaveTextContent('Adding…');
  expect(pendingButton).toHaveAttribute('aria-busy', 'true');
  expect(pendingButton).toBeDisabled();
  expect(addButton('Tea')).toBeDisabled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.queryByRole('link', { name: 'View cart' })).not.toBeInTheDocument();
  fireEvent.click(pendingButton);
  fireEvent.click(addButton('Tea'));
  expect(onAddToCart).toHaveBeenCalledTimes(1);

  await act(async () => { finish(confirmed); });
  expect(screen.getByRole('status')).toHaveTextContent('Coffee added to your cart.');
  expect(screen.getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
  expect(addButton('Coffee')).toBeEnabled();
  expect(addButton('Tea')).toBeEnabled();
});

test.each([{ status: 'error' }, { status: 'busy' }, undefined])('does not confirm an unsuccessful or missing outcome: %j', async (outcome) => {
  const user = userEvent.setup();
  const onAddToCart = jest.fn().mockResolvedValue(outcome);
  render(<Products products={products} onAddToCart={onAddToCart} />);
  await user.click(addButton('Coffee'));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.queryByRole('link', { name: 'View cart' })).not.toBeInTheDocument();
  expect(addButton('Coffee')).toBeEnabled();
});

test('clears an older success when the next add fails', async () => {
  const user = userEvent.setup();
  const onAddToCart = jest.fn().mockResolvedValueOnce(confirmed).mockResolvedValueOnce({ status: 'error' });
  render(<Products products={products} onAddToCart={onAddToCart} />);
  await user.click(addButton('Coffee'));
  expect(screen.getByRole('status')).toHaveTextContent('Coffee added to your cart.');
  await user.click(addButton('Tea'));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test('handles an unexpected rejection and permits a successful retry', async () => {
  const user = userEvent.setup();
  const onAddToCart = jest.fn().mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce(confirmed);
  render(<Products products={products} onAddToCart={onAddToCart} />);
  await user.click(addButton('Coffee'));
  expect(screen.getByRole('alert')).toHaveTextContent('Your cart could not be updated. Please try again.');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await user.click(addButton('Coffee'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Coffee added to your cart.');
});

test('dismisses confirmation and returns focus to the product action', async () => {
  const user = userEvent.setup();
  render(<Products products={products} onAddToCart={jest.fn().mockResolvedValue(confirmed)} />);
  await user.click(addButton('Tea'));
  await user.click(screen.getByRole('button', { name: 'Dismiss cart confirmation' }));
  await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
  expect(addButton('Tea')).toHaveFocus();
});
