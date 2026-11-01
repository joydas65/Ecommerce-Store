import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { loadStripe } from '@stripe/stripe-js/pure';
import PaymentForm from './PaymentForm';

jest.mock('../../lib/commerce-mode', () => ({ isDemoMode: true }));
jest.mock('@stripe/stripe-js/pure', () => ({ loadStripe: jest.fn() }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: () => { throw new Error('Stripe must never mount in demo mode.'); },
  ElementsConsumer: () => null,
  CardElement: () => null,
}));

const money = (amount) => ({ raw: amount, formatted_with_symbol: `$${amount.toFixed(2)}` });
const checkoutToken = {
  id: 'demo_checkout',
  live: {
    line_items: [{ id: 'notebook', name: 'Notebook', quantity: 1, line_total: money(12) }],
    subtotal: money(12), shipping: { price: money(5) }, tax: { amount: money(1.36) }, total_with_tax: money(18.36),
  },
};
const shippingData = {
  firstName: 'Alex', lastName: 'Morgan', email: 'demo@example.com', address1: '123 Demo Street',
  city: 'San Francisco', zip: '94105', shippingCountry: 'US', shippingSubdivision: 'CA', shippingOption: 'standard',
};
const receipt = { id: 'DEMO-123', demo: true, status_payment: 'paid' };
const renderPayment = (overrides = {}) => {
  const props = { checkoutToken, shippingData, backStep: jest.fn(), onCaptureCheckout: jest.fn().mockResolvedValue(receipt), onComplete: jest.fn(), ...overrides };
  render(<PaymentForm {...props} />);
  return props;
};

test('uses simulated payment without initializing Stripe even when a publishable key is configured', async () => {
  const props = renderPayment();
  expect(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toBeTruthy();
  expect(loadStripe).not.toHaveBeenCalled();
  expect(screen.getByText('Simulated payment')).toBeVisible();
  expect(screen.getByText('Sample tax (8%)')).toBeVisible();
  expect(screen.getByText(/You will not be charged/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Place demo order — $18.36' }));
  await waitFor(() => expect(props.onComplete).toHaveBeenCalledWith(receipt));
  expect(props.onCaptureCheckout).toHaveBeenCalledWith('demo_checkout', expect.objectContaining({
    customer: { firstname: 'Alex', lastname: 'Morgan', email: 'demo@example.com' },
    fulfillment: { shipping_method: 'standard' },
    payment: { gateway: 'demo', demo: { failOnce: false } },
  }));
});

test('keeps confirmation pending and blocks repeated submissions while capture is unresolved', async () => {
  let resolveCapture;
  const capture = new Promise((resolve) => { resolveCapture = resolve; });
  const props = renderPayment({ onCaptureCheckout: jest.fn(() => capture) });
  const form = screen.getByRole('button', { name: /^Place demo order/ }).closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(props.onCaptureCheckout).toHaveBeenCalledTimes(1);
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Placing demo order…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Simulate a payment failure' })).toBeDisabled();
  await act(async () => resolveCapture(receipt));
  expect(props.onComplete).toHaveBeenCalledWith(receipt);
});

test('turns off the requested failure after rejection and allows retry with the same checkout details', async () => {
  const onCaptureCheckout = jest.fn().mockRejectedValueOnce(new Error('Simulated payment failure. Your cart is unchanged; please retry.')).mockResolvedValueOnce(receipt);
  const props = renderPayment({ onCaptureCheckout });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Simulate a payment failure' }));
  fireEvent.click(screen.getByRole('button', { name: /^Place demo order/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Simulated payment failure');
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'Simulate a payment failure' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  expect(onCaptureCheckout.mock.calls[0][1].payment.demo.failOnce).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Place demo order/ }));
  await waitFor(() => expect(props.onComplete).toHaveBeenCalledWith(receipt));
  expect(onCaptureCheckout.mock.calls[1][0]).toBe('demo_checkout');
  expect(onCaptureCheckout.mock.calls[1][1].shipping).toEqual(onCaptureCheckout.mock.calls[0][1].shipping);
  expect(onCaptureCheckout.mock.calls[1][1].payment.demo.failOnce).toBe(false);
});
