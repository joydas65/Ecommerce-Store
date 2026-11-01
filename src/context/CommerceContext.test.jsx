import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CommerceProvider, useCommerce } from './CommerceContext';
import { commerce } from '../lib/commerce';

jest.mock('../lib/storefront-config', () => ({ usesSeededCatalog: false, usesSimulatedPayment: false, usesPersistentOrders: false }));
jest.mock('../lib/commerce', () => ({
  commerce: {
    products: { list: jest.fn() },
    cart: { retrieve: jest.fn(), refresh: jest.fn(), add: jest.fn() },
    checkout: { capture: jest.fn() },
  },
}));

function CaptureHarness() {
  const { cart, handleCaptureCheckout } = useCommerce();
  const [order, setOrder] = React.useState(null);
  const [error, setError] = React.useState('');
  const capture = async () => {
    setError('');
    try {
      setOrder(await handleCaptureCheckout('token_1', { payment: { gateway: 'stripe' } }));
    } catch (failure) {
      setError(failure.message || 'Payment failed');
    }
  };
  return <>
    <div>Cart items: {cart.total_items}</div>
    <button onClick={capture}>Submit payment</button>
    {order && <div>Confirmed: {order.customer_reference}</div>}
    {error && <div role="alert">{error}</div>}
  </>;
}

const confirmedOrder = { id: 'order_1', customer_reference: 'REAL-ORDER-1', status_payment: 'paid' };

beforeEach(() => {
  jest.resetAllMocks();
  commerce.products.list.mockResolvedValue({ data: [] });
  commerce.cart.retrieve.mockResolvedValue({ id: 'cart_1', total_items: 2, line_items: [{ id: 'item_1' }] });
  commerce.cart.refresh.mockResolvedValue({ id: 'cart_2', total_items: 0, line_items: [] });
});

const startCheckout = async () => {
  render(<CommerceProvider><CaptureHarness /></CommerceProvider>);
  await screen.findByText('Cart items: 2');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit payment' })); });
};

test('propagates capture errors and preserves the cart for a retry', async () => {
  commerce.checkout.capture.mockRejectedValueOnce(new Error('Card declined')).mockResolvedValueOnce(confirmedOrder);
  await startCheckout();

  expect(await screen.findByRole('alert')).toHaveTextContent('Card declined');
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText(/Confirmed:/)).not.toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit payment' })); });
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

test.each([undefined, '', 'processing', 'pending', 'simulated'])('requires explicit payment confirmation before clearing a legacy Stripe cart: %p', async (status_payment) => {
  commerce.checkout.capture.mockResolvedValue({ id: 'order_1', status_payment });
  await startCheckout();

  expect(await screen.findByRole('alert')).toHaveTextContent('Your order payment has not been confirmed');
  expect(screen.queryByText(/Confirmed:/)).not.toBeInTheDocument();
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
});

test('does not accept a simulated receipt as a legacy Stripe payment', async () => {
  commerce.checkout.capture.mockResolvedValue({ ...confirmedOrder, demo: true });
  await startCheckout();
  expect(await screen.findByRole('alert')).toHaveTextContent('Your order payment has not been confirmed');
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
});

test('accepts an authorized order returned by Commerce.js', async () => {
  commerce.checkout.capture.mockResolvedValue({ ...confirmedOrder, status_payment: 'authorized' });
  await startCheckout();

  expect(await screen.findByText('Confirmed: REAL-ORDER-1')).toBeInTheDocument();
});

function StoreHarness() {
  const { productsStatus, cartStatus, cart, loadProducts, loadCart, handleAddToCart, cartActionError, isUpdatingCart } = useCommerce();
  return <>
    <div>Products: {productsStatus}</div>
    <div>Cart: {cartStatus}</div>
    <div>Cart items: {cart.total_items}</div>
    <button onClick={loadProducts}>Retry products</button>
    <button onClick={loadCart}>Retry cart</button>
    <button disabled={isUpdatingCart} onClick={() => handleAddToCart('product_1', 1)}>Add product</button>
    {cartActionError && <div role="alert">{cartActionError}</div>}
  </>;
}

function MutationOutcomeHarness({ onResult }) {
  const { cart, handleAddToCart, cartActionError, isUpdatingCart } = useCommerce();
  const add = async () => onResult(await handleAddToCart('product_1', 1));
  return <>
    <div>Cart items: {cart.total_items}</div>
    <div>Update pending: {isUpdatingCart ? 'yes' : 'no'}</div>
    {/* Keep this enabled to exercise the provider's lock independently of UI disabling. */}
    <button onClick={add}>Request add</button>
    {cartActionError && <div role="alert">{cartActionError}</div>}
  </>;
}

test('recovers independently from initial catalog and cart failures', async () => {
  commerce.products.list.mockRejectedValueOnce(new Error('Offline'));
  commerce.cart.retrieve.mockRejectedValueOnce(new Error('Offline'));
  render(<CommerceProvider><StoreHarness /></CommerceProvider>);

  await screen.findByText('Products: error');
  await screen.findByText('Cart: error');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry products' })); });
  await screen.findByText('Products: ready');
  expect(screen.getByText('Cart: error')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry cart' })); });
  await screen.findByText('Cart: ready');
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
});

test('reports a cart mutation failure without losing the previous cart', async () => {
  commerce.cart.add.mockRejectedValueOnce(new Error('Offline'));
  render(<CommerceProvider><StoreHarness /></CommerceProvider>);
  await screen.findByText('Cart items: 2');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add product' })); });
  expect(await screen.findByRole('alert')).toHaveTextContent('Your cart could not be updated');
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
});

test('returns an error outcome on add failure and a confirmed cart only after a successful retry', async () => {
  const updatedCart = { id: 'cart_1', total_items: 3, line_items: [{ id: 'item_1', quantity: 3 }] };
  commerce.cart.add.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ cart: updatedCart });
  const onResult = jest.fn();
  render(<CommerceProvider><MutationOutcomeHarness onResult={onResult} /></CommerceProvider>);
  await screen.findByText('Cart items: 2');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request add' })); });
  expect(onResult).toHaveBeenNthCalledWith(1, { status: 'error' });
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Your cart could not be updated');
  expect(screen.getByText('Update pending: no')).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request add' })); });
  expect(onResult).toHaveBeenNthCalledWith(2, { status: 'success', cart: updatedCart });
  expect(screen.getByText('Cart items: 3')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(commerce.cart.add).toHaveBeenLastCalledWith('product_1', 1);
});

test('returns busy for a repeated in-flight add and confirms only the completed provider operation', async () => {
  let finish;
  commerce.cart.add.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onResult = jest.fn();
  render(<CommerceProvider><MutationOutcomeHarness onResult={onResult} /></CommerceProvider>);
  await screen.findByText('Cart items: 2');

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Request add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request add' }));
  });
  expect(commerce.cart.add).toHaveBeenCalledTimes(1);
  expect(onResult).toHaveBeenCalledTimes(1);
  expect(onResult).toHaveBeenCalledWith({ status: 'busy' });
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
  expect(screen.getByText('Update pending: yes')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  const updatedCart = { id: 'cart_1', total_items: 3 };
  await act(async () => finish({ cart: updatedCart }));
  expect(onResult).toHaveBeenCalledTimes(2);
  expect(onResult).toHaveBeenLastCalledWith({ status: 'success', cart: updatedCart });
  expect(screen.getByText('Cart items: 3')).toBeInTheDocument();
  expect(screen.getByText('Update pending: no')).toBeInTheDocument();
});

test.each([undefined, {}, { cart: {} }, { cart: { id: 'cart_1', total_items: -1 } }])(
  'does not confirm an add when the provider returns an invalid cart (%j)', async (response) => {
    commerce.cart.add.mockResolvedValue(response);
    const onResult = jest.fn();
    render(<CommerceProvider><MutationOutcomeHarness onResult={onResult} /></CommerceProvider>);
    await screen.findByText('Cart items: 2');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request add' })); });
    expect(onResult).toHaveBeenCalledWith({ status: 'error' });
    expect(screen.getByText('Cart items: 2')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Your cart could not be updated');
    expect(screen.getByText('Update pending: no')).toBeInTheDocument();
  },
);

test('keeps cart state and initialization when the active page changes', async () => {
  commerce.cart.add.mockResolvedValue({ cart: { id: 'cart_1', total_items: 3 } });
  const view = render(<CommerceProvider><StoreHarness /></CommerceProvider>);
  await screen.findByText('Cart items: 2');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add product' })); });
  await screen.findByText('Cart items: 3');

  view.rerender(<CommerceProvider><CaptureHarness /></CommerceProvider>);
  expect(screen.getByText('Cart items: 3')).toBeInTheDocument();
  await waitFor(() => expect(commerce.cart.retrieve).toHaveBeenCalledTimes(1));
  expect(commerce.products.list).toHaveBeenCalledTimes(1);
});

test('coalesces initial requests during Strict Mode effect replay and handles rejection', async () => {
  commerce.products.list.mockRejectedValueOnce(new Error('Offline'));
  commerce.cart.retrieve.mockRejectedValueOnce(new Error('Offline'));
  render(<React.StrictMode><CommerceProvider><StoreHarness /></CommerceProvider></React.StrictMode>);

  await screen.findByText('Products: error');
  await screen.findByText('Cart: error');
  expect(commerce.products.list).toHaveBeenCalledTimes(1);
  expect(commerce.cart.retrieve).toHaveBeenCalledTimes(1);
});


test('exposes pending cart updates until the result is applied', async () => {
  let finish;
  commerce.cart.add.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<CommerceProvider><StoreHarness /></CommerceProvider>);
  await screen.findByText('Cart items: 2');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add product' })); });
  expect(screen.getByRole('button', { name: 'Add product' })).toBeDisabled();
  expect(screen.getByText('Cart items: 2')).toBeInTheDocument();

  await act(async () => finish({ cart: { id: 'cart_1', total_items: 3 } }));
  expect(screen.getByRole('button', { name: 'Add product' })).toBeEnabled();
  expect(screen.getByText('Cart items: 3')).toBeInTheDocument();
});
