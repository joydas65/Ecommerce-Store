import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import Checkout from './Checkout';
import { commerce } from '../../../lib/commerce';

const mockStripe = { createPaymentMethod: jest.fn() };
const mockElements = { getElement: jest.fn() };
const mockAddress = {
  firstName: 'Joy', lastName: 'Shopper', email: 'joy@example.com',
  address1: '1 Main Street', city: 'Boston', zip: '02108',
  shippingCountry: 'US', shippingSubdivision: 'MA', shippingOption: 'ship_standard',
};

jest.mock('../../../lib/commerce', () => ({
  commerce: {
    checkout: {
      generateToken: jest.fn(),
      checkShippingOption: jest.fn(),
      setTaxZone: jest.fn(),
    },
  },
}));
jest.mock('@stripe/stripe-js/pure', () => ({ loadStripe: jest.fn(() => Promise.resolve({})) }));
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => children,
  CardElement: () => null,
  ElementsConsumer: ({ children }) => children({ stripe: mockStripe, elements: mockElements }),
}));
jest.mock('../AddressForm', () => {
  return function MockAddressForm({ onSubmit, isSubmitting, error, shippingData }) {
    return (
      <div>
        <span>Saved shipping: {shippingData.shippingOption || 'none'}</span>
        {error && <div role="alert">{error}</div>}
        <button disabled={isSubmitting} onClick={() => onSubmit(mockAddress)}>Continue with standard shipping</button>
        <button disabled={isSubmitting} onClick={() => onSubmit({ ...mockAddress, shippingOption: 'ship_express' })}>Continue with express shipping</button>
        <button disabled={isSubmitting} onClick={() => onSubmit({ ...mockAddress, shippingCountry: 'SG', shippingSubdivision: '', zip: '123456' })}>Continue without a region</button>
      </div>
    );
  };
});

const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });
const initialLive = {
  line_items: [{ id: 'item_1', name: 'Coffee', quantity: 2, line_total: money(20) }],
  subtotal: money(20),
  shipping: { price: money(0) },
  tax: { amount: money(0) },
  total_with_tax: money(20),
};
const calculatedLive = {
  ...initialLive,
  shipping: { price: money(5) },
  tax: { amount: money(2) },
  total_with_tax: money(27),
};
const token = { id: 'checkout_123', live: initialLive };
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

const renderCheckout = (overrides = {}) => {
  const props = { cart: { id: 'cart_123' }, onCaptureCheckout: jest.fn().mockResolvedValue(order), ...overrides };
  const result = render(<Checkout {...props} />);
  return { ...result, ...props };
};

const continueToPayment = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with standard shipping' }));
  return screen.findByRole('button', { name: 'Pay $27.00' });
};

beforeEach(() => {
  jest.resetAllMocks();
  commerce.checkout.generateToken.mockResolvedValue(token);
  commerce.checkout.checkShippingOption.mockResolvedValue({ valid: true });
  commerce.checkout.setTaxZone.mockResolvedValue({ valid: true, live: calculatedLive });
  mockStripe.createPaymentMethod.mockResolvedValue({ paymentMethod: { id: 'pm_123' } });
  mockElements.getElement.mockReturnValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

test('validates shipping before calculating tax and displays the returned total before payment', async () => {
  const shipping = deferred();
  const tax = deferred();
  commerce.checkout.checkShippingOption.mockReturnValueOnce(shipping.promise);
  commerce.checkout.setTaxZone.mockReturnValueOnce(tax.promise);
  renderCheckout();

  fireEvent.click(await screen.findByRole('button', { name: 'Continue with standard shipping' }));
  expect(commerce.checkout.generateToken).toHaveBeenCalledWith('cart_123', { type: 'cart' });
  expect(commerce.checkout.checkShippingOption).toHaveBeenCalledWith('checkout_123', {
    shipping_option_id: 'ship_standard', country: 'US', region: 'MA',
  });
  expect(commerce.checkout.setTaxZone).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue with standard shipping' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^Pay / })).not.toBeInTheDocument();

  await act(async () => shipping.resolve({ valid: true }));
  expect(commerce.checkout.setTaxZone).toHaveBeenCalledWith('checkout_123', {
    country: 'US', region: 'MA', postal_zip_code: '02108',
  });
  expect(screen.queryByRole('button', { name: /^Pay / })).not.toBeInTheDocument();

  await act(async () => tax.resolve({ valid: true, live: calculatedLive }));
  expect(screen.getByRole('button', { name: 'Pay $27.00' })).toBeEnabled();
  expect(within(screen.getByText('Shipping').closest('li')).getByText('$5.00')).toBeInTheDocument();
  expect(within(screen.getByText('Tax').closest('li')).getByText('$2.00')).toBeInTheDocument();
  expect(within(screen.getByText('Total').closest('li')).getByText('$27.00')).toBeInTheDocument();
});

test('omits a nonexistent subdivision from shipping and tax requests', async () => {
  renderCheckout();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue without a region' }));
  await screen.findByRole('button', { name: 'Pay $27.00' });

  expect(commerce.checkout.checkShippingOption).toHaveBeenCalledWith('checkout_123', {
    shipping_option_id: 'ship_standard', country: 'SG',
  });
  expect(commerce.checkout.setTaxZone).toHaveBeenCalledWith('checkout_123', {
    country: 'SG', postal_zip_code: '123456',
  });
});

test('keeps payment blocked on shipping failure and lets the shopper retry', async () => {
  commerce.checkout.checkShippingOption.mockRejectedValueOnce(new Error('Shipping rates are unavailable.'));
  renderCheckout();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with standard shipping' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Shipping rates are unavailable.');
  expect(commerce.checkout.setTaxZone).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /^Pay / })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue with standard shipping' })).toBeEnabled();

  await continueToPayment();
  expect(commerce.checkout.checkShippingOption).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('rejects a shipping option the server marks unavailable', async () => {
  commerce.checkout.checkShippingOption.mockResolvedValueOnce({ valid: false });
  renderCheckout();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with standard shipping' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('This shipping option is no longer available.');
  expect(commerce.checkout.setTaxZone).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /^Pay / })).not.toBeInTheDocument();
});

test.each([
  ['invalid tax calculation', { valid: false, live: calculatedLive }],
  ['missing shipping price', { valid: true, live: { ...calculatedLive, shipping: null } }],
  ['missing grand total', { valid: true, live: { ...calculatedLive, total_with_tax: null } }],
])('blocks payment after %s and retries the calculation', async (_, response) => {
  commerce.checkout.setTaxZone.mockResolvedValueOnce(response);
  renderCheckout();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with standard shipping' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to calculate the order total.');
  expect(screen.queryByRole('button', { name: /^Pay / })).not.toBeInTheDocument();

  await continueToPayment();
  expect(commerce.checkout.setTaxZone).toHaveBeenCalledTimes(2);
});

test('preserves submitted shipping data on Back and recalculates after choosing another method', async () => {
  const expressLive = { ...calculatedLive, shipping: { price: money(10) }, total_with_tax: money(32) };
  commerce.checkout.setTaxZone.mockResolvedValueOnce({ valid: true, live: calculatedLive })
    .mockResolvedValueOnce({ valid: true, live: expressLive });
  renderCheckout();
  await continueToPayment();

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Saved shipping: ship_standard')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue with express shipping' }));

  expect(await screen.findByRole('button', { name: 'Pay $32.00' })).toBeEnabled();
  expect(commerce.checkout.checkShippingOption).toHaveBeenLastCalledWith('checkout_123', {
    shipping_option_id: 'ship_express', country: 'US', region: 'MA',
  });
  expect(commerce.checkout.setTaxZone).toHaveBeenCalledTimes(2);
  expect(within(screen.getByText('Shipping').closest('li')).getByText('$10.00')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pay $27.00' })).not.toBeInTheDocument();
});

test('allows retry after checkout token loading fails', async () => {
  commerce.checkout.generateToken.mockRejectedValueOnce(new Error('Network unavailable'));
  renderCheckout();

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to start checkout. Please try again.');
  expect(screen.queryByRole('button', { name: 'Continue with standard shipping' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry checkout' }));

  expect(await screen.findByRole('button', { name: 'Continue with standard shipping' })).toBeEnabled();
  expect(commerce.checkout.generateToken).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('never confirms a slow or rejected capture, then shows only the successful order reference', async () => {
  const capture = deferred();
  const onCaptureCheckout = jest.fn().mockReturnValueOnce(capture.promise).mockResolvedValueOnce(order);
  renderCheckout({ onCaptureCheckout });
  fireEvent.click(await continueToPayment());
  await waitFor(() => expect(onCaptureCheckout).toHaveBeenCalledTimes(1));

  jest.useFakeTimers();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.queryByText(/Thank you for your purchase/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Order ref:/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Processing payment…' })).toBeDisabled();

  await act(async () => capture.reject(new Error('Payment declined.')));
  jest.useRealTimers();
  expect(screen.getByRole('alert')).toHaveTextContent('Payment declined.');
  expect(screen.queryByText(/Thank you for your purchase/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Order ref:/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Pay $27.00' }));
  expect(await screen.findByText('Order ref: ORDER-123')).toBeInTheDocument();
  expect(screen.getByText('Thank you for your purchase, Joy!')).toBeInTheDocument();
  expect(onCaptureCheckout).toHaveBeenCalledTimes(2);
});

test('keeps the confirmed order visible when the cart is refreshed', async () => {
  const props = renderCheckout();
  fireEvent.click(await continueToPayment());
  await screen.findByText('Order ref: ORDER-123');

  props.rerender(<Checkout cart={{ id: 'cart_new' }} onCaptureCheckout={props.onCaptureCheckout} />);

  expect(screen.getByText('Order ref: ORDER-123')).toBeInTheDocument();
  expect(screen.getByText('Thank you for your purchase, Joy!')).toBeInTheDocument();
  expect(commerce.checkout.generateToken).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Continue with standard shipping' })).not.toBeInTheDocument();
});

test('preserves confirmation when cart clearing and refresh resolve alongside order capture', async () => {
  const capture = deferred();
  const nextToken = deferred();
  commerce.checkout.generateToken.mockResolvedValueOnce(token).mockReturnValue(nextToken.promise);

  const CheckoutWithCartRefresh = () => {
    const [cart, setCart] = React.useState({ id: 'cart_123' });
    const captureOrder = async () => {
      const confirmedOrder = await capture.promise;
      setCart({ line_items: [], total_items: 0 });
      Promise.resolve({ id: 'cart_new', line_items: [], total_items: 0 }).then(setCart);
      return confirmedOrder;
    };
    return <Checkout cart={cart} onCaptureCheckout={captureOrder} />;
  };

  render(<CheckoutWithCartRefresh />);
  fireEvent.click(await continueToPayment());
  await waitFor(() => expect(mockStripe.createPaymentMethod).toHaveBeenCalledTimes(1));
  await act(async () => capture.resolve(order));

  expect(screen.getByText('Order ref: ORDER-123')).toBeInTheDocument();
  await act(async () => nextToken.resolve({ ...token, id: 'checkout_new' }));
  expect(screen.getByText('Order ref: ORDER-123')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continue with standard shipping' })).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar', { name: 'Loading checkout' })).not.toBeInTheDocument();
});
