import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { CommerceProvider, useCommerce } from './CommerceContext';
import { commerce } from '../lib/commerce';

jest.mock('../lib/storefront-config', () => ({ usesSeededCatalog: true, usesSimulatedPayment: false, usesPersistentOrders: true, usesHostedStripe: true }));
jest.mock('../lib/commerce', () => ({ commerce: {
  products: { list: jest.fn() }, cart: { retrieve: jest.fn(), refresh: jest.fn() },
  checkout: { startPayment: jest.fn(), recover: jest.fn(), completePayment: jest.fn(), releaseCanceledPayment: jest.fn() },
} }));
let actions;
function Harness() {
  const current = useCommerce();
  useEffect(() => { actions = current; }, [current]);
  return <p>Items: {current.cart.total_items}</p>;
}
const paid = { id: 'order_1', demo: false, persistent: true, payment_provider: 'stripe-test', payment_mode: 'test', status_payment: 'paid' };

beforeEach(() => {
  jest.clearAllMocks();
  commerce.products.list.mockResolvedValue({ data: [] });
  commerce.cart.retrieve.mockResolvedValue({ id: 'cart', total_items: 1 });
  commerce.cart.refresh.mockResolvedValue({ id: 'empty', total_items: 0 });
});

test('creating or resuming a hosted session never confirms payment or clears cart state', async () => {
  const session = { order: { status: 'PENDING_PAYMENT' }, checkoutUrl: 'https://checkout.stripe.com/pay' };
  commerce.checkout.startPayment.mockResolvedValue(session);
  commerce.checkout.recover.mockResolvedValue(session);
  render(<CommerceProvider><Harness /></CommerceProvider>);
  await screen.findByText('Items: 1');
  await act(async () => {
    await expect(actions.handleStartPayment('token')).resolves.toEqual(session);
    await expect(actions.handleResumePayment()).resolves.toEqual(session);
  });
  expect(commerce.checkout.completePayment).not.toHaveBeenCalled();
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
  expect(screen.getByText('Items: 1')).toBeVisible();
});

test.each([{ id: 'cs_test_1' }, { ...paid, payment_mode: 'live' }, { ...paid, status_payment: 'pending' }, { ...paid, demo: true }, { ...paid, persistent: false }])('rejects an unsupported completion response without changing cart (%j)', async (receipt) => {
  commerce.checkout.completePayment.mockResolvedValue(receipt);
  render(<CommerceProvider><Harness /></CommerceProvider>);
  await screen.findByText('Items: 1');
  await expect(actions.handleCompletePayment({ server: 'snapshot' })).rejects.toThrow(/not been confirmed/);
  expect(commerce.cart.refresh).not.toHaveBeenCalled();
  expect(screen.getByText('Items: 1')).toBeVisible();
});

test('passes verified server state through the adapter and preserves its newer cart snapshot', async () => {
  commerce.checkout.completePayment.mockResolvedValue({ ...paid, cart: { id: 'newer', total_items: 3 } });
  commerce.cart.refresh.mockRejectedValue(new Error('Storage unavailable'));
  render(<CommerceProvider><Harness /></CommerceProvider>);
  await screen.findByText('Items: 1');
  const serverOrder = { status: 'CONFIRMED', paymentStatus: 'PAID' };
  await act(async () => { await actions.handleCompletePayment(serverOrder); });
  expect(commerce.checkout.completePayment).toHaveBeenCalledWith(serverOrder);
  expect(screen.getByText('Items: 3')).toBeVisible();
});
