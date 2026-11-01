import { act, render, screen } from '@testing-library/react';
import { CommerceProvider, useCommerce } from './CommerceContext';
import { commerce } from '../lib/commerce';
import { DEMO_CART_STORAGE_KEY } from '../lib/demo/storage-key';

jest.mock('../lib/commerce-mode', () => ({ isDemoMode: true }));
jest.mock('../lib/commerce', () => ({ commerce: {
  products: { list: jest.fn() },
  cart: { retrieve: jest.fn() },
} }));

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
