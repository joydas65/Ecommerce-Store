import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import App from './App';
import { commerce } from './lib/commerce';

jest.mock('./lib/commerce', () => ({
  commerce: {
    products: { list: jest.fn() },
    cart: { retrieve: jest.fn(), refresh: jest.fn() },
    checkout: { capture: jest.fn() },
  },
}));

// Exercise App's capture/cart contract without duplicating the checkout UI suite.
jest.mock('./components', () => {
  const React = require('react');
  return {
    Navbar: ({ totalItems }) => <div>Cart items: {totalItems}</div>,
    Products: () => null,
    Cart: () => null,
    Checkout: function Checkout({ onCaptureCheckout }) {
      const [order, setOrder] = React.useState(null);
      const [error, setError] = React.useState('');
      const capture = async () => {
        setError('');
        try {
          setOrder(await onCaptureCheckout('token_1', { payment: { gateway: 'stripe' } }));
        } catch (failure) {
          setError(failure.message || 'Payment failed');
        }
      };
      return <>
        <button onClick={capture}>Submit payment</button>
        {order && <div>Confirmed: {order.customer_reference}</div>}
        {error && <div role="alert">{error}</div>}
      </>;
    },
  };
});

const confirmedOrder = { id: 'order_1', customer_reference: 'REAL-ORDER-1', status_payment: 'paid' };

beforeEach(() => {
  jest.resetAllMocks();
  window.history.replaceState({}, '', '/checkout');
  commerce.products.list.mockResolvedValue({ data: [] });
  commerce.cart.retrieve.mockResolvedValue({ id: 'cart_1', total_items: 2, line_items: [{ id: 'item_1' }] });
  commerce.cart.refresh.mockResolvedValue({ id: 'cart_2', total_items: 0, line_items: [] });
});

const startCheckout = async () => {
  render(<App />);
  await screen.findByText('Cart items: 2');
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }));
};

test('propagates capture errors and preserves the cart for a retry', async () => {
  commerce.checkout.capture.mockRejectedValueOnce(new Error('Card declined')).mockResolvedValueOnce(confirmedOrder);
  await startCheckout();

  expect(await screen.findByRole('alert')).toHaveTextContent('Card declined');
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText(/Confirmed:/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }));
  expect(await screen.findByText('Confirmed: REAL-ORDER-1')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(commerce.checkout.capture).toHaveBeenLastCalledWith('token_1', { payment: { gateway: 'stripe' } });
  expect(commerce.cart.refresh).toHaveBeenCalledTimes(1);
});

test('does not refresh the cart or return an order while capture is pending', async () => {
  let resolveCapture;
  commerce.checkout.capture.mockReturnValue(new Promise((resolve) => { resolveCapture = resolve; }));
  await startCheckout();

  expect(screen.queryByText(/Confirmed:/)).not.toBeInTheDocument();
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();

  await act(async () => resolveCapture(confirmedOrder));
  expect(screen.getByText('Confirmed: REAL-ORDER-1')).toBeInTheDocument();
  expect(screen.getByText('Cart items: 0')).toBeInTheDocument();
});

test('keeps the confirmed order successful when refreshing the cart fails', async () => {
  commerce.checkout.capture.mockResolvedValue(confirmedOrder);
  commerce.cart.refresh.mockRejectedValue(new Error('Cart service unavailable'));
  await startCheckout();

  expect(await screen.findByText('Confirmed: REAL-ORDER-1')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Cart items: 0')).toBeInTheDocument();
  expect(commerce.checkout.capture).toHaveBeenCalledTimes(1);
});

test.each([null, {}, { customer_reference: 'UNCONFIRMED' }])('does not confirm an invalid capture response (%j)', async (response) => {
  commerce.checkout.capture.mockResolvedValue(response);
  await startCheckout();

  expect(await screen.findByRole('alert')).toHaveTextContent('We could not confirm your order');
  expect(screen.queryByText(/Confirmed:/)).not.toBeInTheDocument();
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
});

test('does not show an explicitly unpaid order as a completed purchase', async () => {
  commerce.checkout.capture.mockResolvedValue({ ...confirmedOrder, status_payment: 'not_paid' });
  await startCheckout();

  expect(await screen.findByRole('alert')).toHaveTextContent('Your order payment has not been confirmed');
  expect(screen.queryByText(/Confirmed:/)).not.toBeInTheDocument();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
});

test('accepts an authorized order returned by Commerce.js', async () => {
  commerce.checkout.capture.mockResolvedValue({ ...confirmedOrder, status_payment: 'authorized' });
  await startCheckout();

  expect(await screen.findByText('Confirmed: REAL-ORDER-1')).toBeInTheDocument();
});
