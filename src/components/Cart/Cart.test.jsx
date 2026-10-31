import { fireEvent, render, screen } from '@testing-library/react';

import Cart from './Cart';

const cart = {
  id: 'cart_1',
  subtotal: { formatted_with_symbol: '$20.00' },
  line_items: [{
    id: 'item_1',
    name: 'Coffee',
    quantity: 2,
    media: { source: '/product-fixture.png' },
    line_total: { formatted_with_symbol: '$20.00' },
  }],
};

test('blocks cart edits and checkout during an update, then restores each action', () => {
  const props = {
    cart,
    handleUpdateCartQty: jest.fn(),
    handleRemoveFromCart: jest.fn(),
    handleEmptyCart: jest.fn(),
  };
  const view = render(<Cart {...props} isUpdating />);

  for (const name of ['Decrease Coffee quantity', 'Increase Coffee quantity', 'Remove', 'Empty Cart']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  const checkout = screen.getByRole('link', { name: 'Checkout' });
  expect(checkout).toHaveAttribute('aria-disabled', 'true');
  expect(checkout).toHaveAttribute('tabindex', '-1');
  expect(fireEvent.click(checkout)).toBe(false);
  expect(props.handleUpdateCartQty).not.toHaveBeenCalled();
  expect(props.handleRemoveFromCart).not.toHaveBeenCalled();
  expect(props.handleEmptyCart).not.toHaveBeenCalled();

  view.rerender(<Cart {...props} />);
  for (const name of ['Decrease Coffee quantity', 'Increase Coffee quantity', 'Remove', 'Empty Cart']) {
    const button = screen.getByRole('button', { name });
    expect(button).toBeEnabled();
    fireEvent.click(button);
  }
  expect(props.handleUpdateCartQty).toHaveBeenNthCalledWith(1, 'item_1', 1);
  expect(props.handleUpdateCartQty).toHaveBeenNthCalledWith(2, 'item_1', 3);
  expect(props.handleRemoveFromCart).toHaveBeenCalledWith('item_1');
  expect(props.handleEmptyCart).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout');
  expect(screen.getByRole('link', { name: 'Checkout' })).not.toHaveAttribute('aria-disabled');
});
