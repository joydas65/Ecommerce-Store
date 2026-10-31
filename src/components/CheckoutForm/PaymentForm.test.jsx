import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import PaymentForm from './PaymentForm';

const mockStripe = { createPaymentMethod: jest.fn() };
const mockElements = { getElement: jest.fn() };

jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(() => Promise.resolve({})) }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => children,
  CardElement: () => null,
  ElementsConsumer: ({ children }) => children({ stripe: mockStripe, elements: mockElements }),
}));

const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });
const checkoutToken = {
  id: 'checkout_123',
  live: {
    line_items: [{ id: 'item_1', name: 'Coffee', quantity: 2, line_total: money(20) }],
    subtotal: money(20),
    shipping: { price: money(5) },
    tax: { amount: money(2) },
    total_with_tax: money(27),
  },
};
const shippingData = {
  firstName: 'Joy', lastName: 'Shopper', email: 'joy@example.com',
  address1: '1 Main Street', city: 'Boston', zip: '02108',
  shippingCountry: 'US', shippingSubdivision: 'MA', shippingOption: 'ship_standard',
};
const order = { id: 'order_123', customer_reference: 'ORDER-123', customer: { firstname: 'Joy' } };

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderPayment = (overrides = {}) => {
  const props = {
    checkoutToken,
    shippingData,
    backStep: jest.fn(),
    onCaptureCheckout: jest.fn().mockResolvedValue(order),
    onComplete: jest.fn(),
    ...overrides,
  };
  const result = render(<PaymentForm {...props} />);
  return { ...result, ...props };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStripe.createPaymentMethod.mockResolvedValue({ paymentMethod: { id: 'pm_123' } });
  mockElements.getElement.mockReturnValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

test('shows the server-calculated shipping, tax, and grand total in the review and Pay button', () => {
  renderPayment();

  expect(within(screen.getByText('Subtotal').closest('li')).getByText('$20.00')).toBeInTheDocument();
  expect(within(screen.getByText('Shipping').closest('li')).getByText('$5.00')).toBeInTheDocument();
  expect(within(screen.getByText('Tax').closest('li')).getByText('$2.00')).toBeInTheDocument();
  expect(within(screen.getByText('Total').closest('li')).getByText('$27.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pay $27.00' })).toBeEnabled();
});

test('waits for capture even after three seconds, prevents duplicate submissions, and confirms the returned order', async () => {
  const capture = deferred();
  const props = renderPayment({ onCaptureCheckout: jest.fn(() => capture.promise) });
  const form = screen.getByRole('button', { name: 'Pay $27.00' }).closest('form');

  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(props.onCaptureCheckout).toHaveBeenCalledTimes(1));
  expect(mockStripe.createPaymentMethod).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Processing payment…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

  jest.useFakeTimers();
  act(() => jest.advanceTimersByTime(5000));
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.queryByText(/Thank you for your purchase/)).not.toBeInTheDocument();

  await act(async () => capture.resolve(order));
  expect(props.onComplete).toHaveBeenCalledWith(order);
  expect(props.onCaptureCheckout).toHaveBeenCalledWith('checkout_123', expect.objectContaining({
    fulfillment: { shipping_method: 'ship_standard' },
    shipping: expect.objectContaining({ country: 'US', county_state: 'MA', postal_zip_code: '02108' }),
    payment: { gateway: 'stripe', stripe: { payment_method_id: 'pm_123' } },
  }));
});

test('shows a capture failure without confirming and allows a successful retry', async () => {
  const onCaptureCheckout = jest.fn()
    .mockRejectedValueOnce({ data: { error: { message: 'Your payment was declined.' } } })
    .mockResolvedValueOnce(order);
  const props = renderPayment({ onCaptureCheckout });

  fireEvent.click(screen.getByRole('button', { name: 'Pay $27.00' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your payment was declined.');
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Pay $27.00' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'Pay $27.00' }));
  await waitFor(() => expect(props.onComplete).toHaveBeenCalledWith(order));
  expect(onCaptureCheckout).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('shows Stripe validation errors and never attempts order capture', async () => {
  mockStripe.createPaymentMethod.mockResolvedValueOnce({ error: { message: 'Your card number is incomplete.' } });
  const props = renderPayment();

  fireEvent.click(screen.getByRole('button', { name: 'Pay $27.00' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your card number is incomplete.');
  expect(props.onCaptureCheckout).not.toHaveBeenCalled();
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Pay $27.00' })).toBeEnabled();
});

test('shows a recoverable error when Stripe rejects unexpectedly', async () => {
  mockStripe.createPaymentMethod.mockRejectedValueOnce(new Error('Payment connection unavailable.'));
  const props = renderPayment();

  fireEvent.click(screen.getByRole('button', { name: 'Pay $27.00' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Payment connection unavailable.');
  expect(props.onCaptureCheckout).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Pay $27.00' })).toBeEnabled();
});

test('handles a capture rejection without an API error payload', async () => {
  const props = renderPayment({ onCaptureCheckout: jest.fn().mockRejectedValue(null) });

  fireEvent.click(screen.getByRole('button', { name: 'Pay $27.00' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to complete your order. Please try again.');
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Pay $27.00' })).toBeEnabled();
});

test('keeps free shipping visible and displays the recalculated total without tax', () => {
  renderPayment({
    checkoutToken: {
      ...checkoutToken,
      live: { ...checkoutToken.live, shipping: { price: money(0) }, tax: null, total_with_tax: money(20) },
    },
  });

  expect(within(screen.getByText('Shipping').closest('li')).getByText('$0.00')).toBeInTheDocument();
  expect(screen.queryByText('Tax')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pay $20.00' })).toBeEnabled();
});

test('labels tax already included in prices without adding it again', () => {
  renderPayment({
    checkoutToken: {
      ...checkoutToken,
      live: {
        ...checkoutToken.live,
        tax: { amount: money(2), included_in_price: true },
        total_with_tax: money(25),
      },
    },
  });

  expect(within(screen.getByText('Tax (included)').closest('li')).getByText('$2.00')).toBeInTheDocument();
  expect(within(screen.getByText('Total').closest('li')).getByText('$25.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pay $25.00' })).toBeEnabled();
});
