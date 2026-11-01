import { act, fireEvent, render, screen } from '@testing-library/react';
import { loadStripe } from '@stripe/stripe-js/pure';
import PaymentForm from './PaymentForm';

jest.mock('../../lib/storefront-config', () => ({ usesHostedStripe: true, usesSimulatedPayment: false, usesSeededCatalog: true }));
jest.mock('@stripe/stripe-js/pure', () => ({ loadStripe: jest.fn() }));

const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });
const token = { id: 'token', live: { line_items: [{ id: 'item', name: 'Notebook', quantity: 1, line_total: money(12) }],
  subtotal: money(12), shipping: { price: money(5) }, tax: { amount: money(1.36) }, total_with_tax: money(18.36) } };
const paid = { id: 'order_1', status_payment: 'paid', payment_provider: 'stripe-test', payment_mode: 'test', persistent: true };

function setup(onStartPayment = jest.fn()) {
  const onComplete = jest.fn();
  render(<PaymentForm checkoutToken={token} backStep={jest.fn()} onStartPayment={onStartPayment} onComplete={onComplete} />);
  return { onComplete, onStartPayment, submit: () => fireEvent.submit(screen.getByRole('button', { name: /Continue to Stripe|Opening Stripe/ }).closest('form')) };
}

test('shows test-only hosted checkout without initializing the legacy Stripe SDK', () => {
  setup();
  expect(screen.getByRole('heading', { name: 'Stripe test checkout' })).toBeVisible();
  expect(screen.getByText(/No real money is charged/)).toBeVisible();
  expect(screen.getByText('$18.36')).toBeVisible();
  expect(loadStripe).not.toHaveBeenCalled();
});

test('waits for session creation, suppresses duplicate submits, and never treats navigation as payment success', async () => {
  let resolve;
  const props = setup(jest.fn(() => new Promise((done) => { resolve = done; })));
  props.submit();
  props.submit();
  expect(props.onStartPayment).toHaveBeenCalledTimes(1);
  expect(props.onStartPayment).toHaveBeenCalledWith('token');
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  await act(async () => resolve(null));
  expect(props.onComplete).not.toHaveBeenCalled();
});

test.each([{ id: 'cs_test_123', status: 'complete' }, { ...paid, payment_mode: 'live' }, { ...paid, status_payment: 'pending' }])('does not confirm an unsupported payment response (%j)', async (result) => {
  const props = setup(jest.fn().mockResolvedValue(result));
  await act(async () => props.submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('Payment has not been confirmed');
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue to Stripe test checkout' })).toBeEnabled();
});

test('only an already verified paid replay completes the checkout', async () => {
  const props = setup(jest.fn().mockResolvedValue(paid));
  await act(async () => props.submit());
  expect(props.onComplete).toHaveBeenCalledWith(paid);
});

test('a failed start unlocks a safe retry and shows its recovery instruction', async () => {
  const start = jest.fn().mockRejectedValueOnce(new Error('Resume the saved checkout')).mockResolvedValue(null);
  const props = setup(start);
  await act(async () => props.submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('Resume the saved checkout');
  await act(async () => props.submit());
  expect(start).toHaveBeenCalledTimes(2);
  expect(props.onComplete).not.toHaveBeenCalled();
});
