import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import Checkout from './Checkout';
import { commerce } from '../../../lib/commerce';

const mockStripe = { createPaymentMethod: jest.fn() };
const mockElements = { getElement: jest.fn() };

jest.mock('../../../lib/commerce', () => ({
  commerce: {
    services: {
      localeListShippingCountries: jest.fn(),
      localeListSubdivisions: jest.fn(),
    },
    checkout: {
      generateToken: jest.fn(),
      getShippingOptions: jest.fn(),
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

const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });

test('completes the real address and payment forms, preserving input on Back and awaiting a confirmed order', async () => {
  const live = {
    line_items: [{ id: 'item_1', name: 'Coffee', quantity: 2, line_total: money(20) }],
    subtotal: money(20), shipping: { price: money(0) }, tax: { amount: money(0) }, total_with_tax: money(20),
  };
  commerce.checkout.generateToken.mockResolvedValue({ id: 'checkout_123', live });
  commerce.services.localeListShippingCountries.mockResolvedValue({ countries: { US: 'United States' } });
  commerce.services.localeListSubdivisions.mockResolvedValue({ subdivisions: { MA: 'Massachusetts', NY: 'New York' } });
  commerce.checkout.getShippingOptions.mockResolvedValue([
    { id: 'ship_standard', description: 'Standard', price: money(5) },
    { id: 'ship_express', description: 'Express', price: money(10) },
  ]);
  commerce.checkout.checkShippingOption.mockResolvedValue({ valid: true });
  commerce.checkout.setTaxZone.mockResolvedValue({
    valid: true,
    live: { ...live, shipping: { price: money(10) }, tax: { amount: money(2) }, total_with_tax: money(32) },
  });
  mockStripe.createPaymentMethod.mockResolvedValue({ paymentMethod: { id: 'pm_123' } });
  mockElements.getElement.mockReturnValue({});
  let resolveCapture;
  const onCaptureCheckout = jest.fn(() => new Promise((resolve) => { resolveCapture = resolve; }));

  render(<Checkout cart={{ id: 'cart_123' }} onCaptureCheckout={onCaptureCheckout} />);

  await screen.findByLabelText(/First name/);
  const addressFields = [
    [/First name/, 'Joy'], [/Last name/, 'Shopper'], [/Address line 1/, '1 Main Street'],
    [/Email/, 'joy@example.com'], [/City/, 'New York'], [/Zip \/ Postal code/, '10001'],
  ];
  addressFields.forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());

  fireEvent.mouseDown(screen.getByLabelText('Shipping Subdivision'));
  fireEvent.click(screen.getByRole('option', { name: 'New York' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  fireEvent.mouseDown(screen.getByLabelText('Shipping Options'));
  fireEvent.click(screen.getByRole('option', { name: 'Express - ($10.00)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  expect(await screen.findByRole('button', { name: 'Pay $32.00' })).toBeEnabled();
  expect(commerce.checkout.checkShippingOption).toHaveBeenCalledWith('checkout_123', {
    shipping_option_id: 'ship_express', country: 'US', region: 'NY',
  });
  expect(commerce.checkout.setTaxZone).toHaveBeenCalledWith('checkout_123', {
    country: 'US', region: 'NY', postal_zip_code: '10001',
  });
  expect(within(screen.getByText('Shipping').closest('li')).getByText('$10.00')).toBeInTheDocument();
  expect(within(screen.getByText('Total').closest('li')).getByText('$32.00')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  addressFields.forEach(([label, value]) => expect(screen.getByLabelText(label)).toHaveValue(value));
  expect(screen.getByLabelText('Shipping Country')).toHaveTextContent('United States');
  expect(screen.getByLabelText('Shipping Subdivision')).toHaveTextContent('New York');
  expect(screen.getByLabelText('Shipping Options')).toHaveTextContent('Express');

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Pay $32.00' }));
  await waitFor(() => expect(onCaptureCheckout).toHaveBeenCalledTimes(1));
  expect(onCaptureCheckout).toHaveBeenCalledWith('checkout_123', expect.objectContaining({
    customer: { firstname: 'Joy', lastname: 'Shopper', email: 'joy@example.com' },
    shipping: expect.objectContaining({ street: '1 Main Street', town_city: 'New York', county_state: 'NY', postal_zip_code: '10001', country: 'US' }),
    fulfillment: { shipping_method: 'ship_express' },
  }));
  expect(screen.getByRole('button', { name: 'Processing payment…' })).toBeDisabled();
  expect(screen.queryByText(/Thank you for your purchase/)).not.toBeInTheDocument();

  await act(async () => resolveCapture({
    id: 'order_123', customer_reference: 'ORDER-123', status_payment: 'paid', customer: { firstname: 'Joy', lastname: 'Shopper' },
  }));
  expect(screen.getByText('Order ref: ORDER-123')).toBeInTheDocument();
  expect(screen.getByText('Thank you for your purchase, Joy!')).toBeInTheDocument();
});
