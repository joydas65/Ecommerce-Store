import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { loadStripe } from '@stripe/stripe-js/pure';

const mockStripe = { createPaymentMethod: jest.fn() };
const mockElements = { getElement: jest.fn() };

jest.mock('@stripe/stripe-js/pure', () => ({ loadStripe: jest.fn() }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => children,
  CardElement: () => null,
  ElementsConsumer: ({ children }) => children({ stripe: mockStripe, elements: mockElements }),
}));

const configuredKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

beforeAll(() => {
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
});

afterAll(() => {
  if (configuredKey === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = configuredKey;
});

test('renders a recoverable payment-unavailable state without initializing Stripe when its key is missing', () => {
  // Import only after clearing configuration; keep React's module instance intact.
  const PaymentForm = require('./PaymentForm').default;
  const onCaptureCheckout = jest.fn();
  const checkoutToken = {
    id: 'checkout_123',
    live: {
      line_items: [],
      subtotal: { formatted_with_symbol: '$20.00' },
      shipping: { price: { formatted_with_symbol: '$5.00' } },
      total_with_tax: { formatted_with_symbol: '$25.00' },
    },
  };
  render(<PaymentForm checkoutToken={checkoutToken} shippingData={{}} backStep={jest.fn()} onCaptureCheckout={onCaptureCheckout} onComplete={jest.fn()} />);

  expect(loadStripe).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Payments are temporarily unavailable.');
  expect(screen.getByRole('button', { name: 'Pay $25.00' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();

  fireEvent.submit(screen.getByRole('button', { name: 'Pay $25.00' }).closest('form'));
  expect(mockStripe.createPaymentMethod).not.toHaveBeenCalled();
  expect(onCaptureCheckout).not.toHaveBeenCalled();
});
