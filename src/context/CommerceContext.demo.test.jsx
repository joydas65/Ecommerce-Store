import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CommerceProvider, useCommerce } from './CommerceContext';
import { commerce } from '../lib/commerce';
import { DEMO_CART_STORAGE_KEY } from '../lib/demo/storage-key';

let mockPersistent = false;
jest.mock('../lib/storefront-config', () => ({ usesSeededCatalog: true, usesSimulatedPayment: true, get usesPersistentOrders() { return mockPersistent; } }));
jest.mock('../lib/commerce', () => ({ commerce: {
  products: { list: jest.fn() },
  cart: { retrieve: jest.fn(), refresh: jest.fn() },
  checkout: { capture: jest.fn() },
} }));

beforeEach(() => {
  jest.resetAllMocks();
  mockPersistent = false;
  commerce.products.list.mockResolvedValue({ data: [] });
  commerce.cart.retrieve.mockResolvedValue({ id: 'before', total_items: 2 });
  commerce.cart.refresh.mockResolvedValue({ id: 'after', total_items: 0 });
});

function CartHarness() {
  const { cart } = useCommerce();
  return <p>Cart: {cart.id}, items: {cart.total_items}</p>;
}

test('refreshes the demo cart after another tab completes a purchase and unsubscribes on unmount', async () => {
  commerce.products.list.mockResolvedValue({ data: [] });
  commerce.cart.retrieve.mockResolvedValueOnce({ id: 'before', total_items: 1 })
    .mockResolvedValue({ id: 'after', total_items: 0 });
  const { unmount } = render(<CommerceProvider><CartHarness /></CommerceProvider>);
  await screen.findByText('Cart: before, items: 1');

  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-setting' })));
  expect(commerce.cart.retrieve).toHaveBeenCalledTimes(1);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: DEMO_CART_STORAGE_KEY })));
  expect(await screen.findByText('Cart: after, items: 0')).toBeVisible();
  expect(commerce.cart.retrieve).toHaveBeenCalledTimes(2);

  unmount();
  window.dispatchEvent(new StorageEvent('storage', { key: DEMO_CART_STORAGE_KEY }));
  expect(commerce.cart.retrieve).toHaveBeenCalledTimes(2);
});

function CaptureHarness() {
  const { cart, handleCaptureCheckout } = useCommerce();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const capture = async () => {
    try { await handleCaptureCheckout('token_1', { payment: { gateway: 'demo' } }); setConfirmed(true); }
    catch (failure) { setError(failure.message); }
  };
  return <>
    <p>Cart items: {cart.total_items}</p>
    <button onClick={capture}>Place order</button>
    {confirmed && <p>Confirmed order</p>}
    {error && <p role="alert">{error}</p>}
  </>;
}

test.each([
  [false, { id: 'DEMO-1', demo: true, status_payment: 'paid' }, true],
  [false, { id: 'DEMO-1', status_payment: 'paid' }, false],
  [false, { id: 'DEMO-1', demo: true }, false],
  [false, { id: 'DEMO-1', demo: true, status_payment: 'pending' }, false],
  [true, { id: 'order_1', demo: true, persistent: true, status_payment: 'simulated' }, true],
  [true, { id: 'order_1', demo: true, persistent: true, status_payment: 'paid' }, false],
  [true, { id: 'order_1', demo: true, status_payment: 'simulated' }, false],
  [true, { id: 'order_1', demo: true, persistent: true }, false],
])('checks the selected simulation confirmation contract (remote=%s, receipt=%j)', async (persistent, receipt, accepted) => {
  mockPersistent = persistent;
  commerce.checkout.capture.mockResolvedValue(receipt);
  render(<CommerceProvider><CaptureHarness /></CommerceProvider>);
  await screen.findByText('Cart items: 2');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Place order' })));

  if (accepted) {
    expect(await screen.findByText('Confirmed order')).toBeVisible();
    expect(await screen.findByText('Cart items: 0')).toBeVisible();
  } else {
    expect(await screen.findByRole('alert')).toHaveTextContent('Your order payment has not been confirmed');
    expect(screen.queryByText('Confirmed order')).not.toBeInTheDocument();
    expect(screen.getByText('Cart items: 2')).toBeVisible();
    expect(commerce.cart.refresh).not.toHaveBeenCalled();
  }
});

test('retains a changed cart returned by persistent order cleanup instead of forcing it empty', async () => {
  mockPersistent = true;
  commerce.checkout.capture.mockResolvedValue({ id: 'order_1', demo: true, persistent: true, status_payment: 'simulated', cart: { id: 'changed', total_items: 3 } });
  commerce.cart.refresh.mockRejectedValue(new Error('Storage temporarily unavailable'));
  render(<CommerceProvider><CaptureHarness /></CommerceProvider>);
  await screen.findByText('Cart items: 2');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Place order' })));
  expect(await screen.findByText('Confirmed order')).toBeVisible();
  expect(screen.getByText('Cart items: 3')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
