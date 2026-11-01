import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCommerce } from '../../context/CommerceContext';
import ProductPurchase from './ProductPurchase';

jest.mock('../../context/CommerceContext', () => ({ useCommerce: jest.fn() }));

const product = {
  id: 'demo-desk-mat', name: 'Desk Mat',
  price: { raw: 34, formatted_with_symbol: '$34.00' },
};
const confirmed = { status: 'success', cart: { id: 'cart_1', total_items: 1 } };
const addButton = () => screen.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true });
let handleAddToCart;

beforeEach(() => {
  handleAddToCart = jest.fn();
  useCommerce.mockReturnValue({ handleAddToCart, isUpdatingCart: false, cartActionError: '' });
});

test('waits for a confirmed add and suppresses repeated clicks while it is pending', async () => {
  let finish;
  handleAddToCart.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<ProductPurchase product={product} />);

  fireEvent.click(addButton());
  const pending = screen.getByRole('button', { name: 'Adding… Desk Mat' });
  expect(pending).toBeDisabled();
  expect(pending).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.queryByRole('link', { name: 'View cart' })).not.toBeInTheDocument();
  fireEvent.click(pending);
  fireEvent.click(pending);
  expect(handleAddToCart).toHaveBeenCalledTimes(1);
  expect(handleAddToCart).toHaveBeenCalledWith('demo-desk-mat', 1);

  await act(async () => { finish(confirmed); });
  expect(screen.getByRole('status')).toHaveTextContent('Desk Mat added to your cart.');
  expect(screen.getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
  expect(addButton()).toBeEnabled();
});

test.each([{ status: 'error' }, { status: 'busy' }, undefined])('never confirms an unsuccessful or absent outcome: %j', async (outcome) => {
  const user = userEvent.setup();
  handleAddToCart.mockResolvedValue(outcome);
  render(<ProductPurchase product={product} />);
  await user.click(addButton());
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.queryByRole('link', { name: 'View cart' })).not.toBeInTheDocument();
  expect(addButton()).toBeEnabled();
});

test('clears a previous confirmation when the following add fails, then permits a retry', async () => {
  const user = userEvent.setup();
  handleAddToCart.mockResolvedValueOnce(confirmed)
    .mockResolvedValueOnce({ status: 'error' })
    .mockResolvedValueOnce(confirmed);
  render(<ProductPurchase product={product} />);
  await user.click(addButton());
  expect(screen.getByRole('status')).toHaveTextContent('Desk Mat added to your cart.');
  await user.click(addButton());
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await user.click(addButton());
  expect(screen.getByRole('status')).toHaveTextContent('Desk Mat added to your cart.');
});

test('handles an unexpected rejection without false success and recovers on retry', async () => {
  const user = userEvent.setup();
  handleAddToCart.mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce(confirmed);
  render(<ProductPurchase product={product} />);
  await user.click(addButton());
  expect(screen.getByRole('alert')).toHaveTextContent('Your cart could not be updated. Please try again.');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  await user.click(addButton());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Desk Mat added to your cart.');
});

test('respects a cart mutation already in progress elsewhere', () => {
  useCommerce.mockReturnValue({ handleAddToCart, isUpdatingCart: true, cartActionError: '' });
  render(<ProductPurchase product={product} />);
  expect(addButton()).toBeDisabled();
  fireEvent.click(addButton());
  expect(handleAddToCart).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test('dismisses confirmation and returns keyboard focus to the add action', async () => {
  const user = userEvent.setup();
  handleAddToCart.mockResolvedValue(confirmed);
  render(<ProductPurchase product={product} />);
  await user.click(addButton());
  await user.click(screen.getByRole('button', { name: 'Dismiss cart confirmation' }));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(addButton()).toHaveFocus();
});
