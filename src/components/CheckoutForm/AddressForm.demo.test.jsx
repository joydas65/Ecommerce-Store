import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddressForm from './AddressForm';
import { commerce } from '../../lib/commerce';

jest.mock('../../lib/commerce-mode', () => ({ isDemoMode: true }));
jest.mock('../../lib/commerce', () => ({ commerce: {
  services: { localeListShippingCountries: jest.fn(), localeListSubdivisions: jest.fn() },
  checkout: { getShippingOptions: jest.fn() },
} }));

beforeEach(() => {
  commerce.services.localeListShippingCountries.mockResolvedValue({ countries: { US: 'United States', GB: 'United Kingdom' } });
  commerce.services.localeListSubdivisions.mockImplementation(async (country) => ({ subdivisions: country === 'US' ? { CA: 'California', NY: 'New York' } : {} }));
  commerce.checkout.getShippingOptions.mockResolvedValue([{ id: 'standard', description: 'Standard', price: { formatted_with_symbol: '$5.00' } }]);
});

test.each(['US', 'GB'])('sample address fills fictitious details and leaves shipping usable from %s', async (country) => {
  const onSubmit = jest.fn();
  render(<AddressForm checkoutToken={{ id: 'demo_checkout' }} shippingData={{ shippingCountry: country }} onSubmit={onSubmit} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Use sample address' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  expect(screen.getByLabelText(/First name/)).toHaveValue('Alex');
  expect(screen.getByLabelText(/Email/)).toHaveValue('demo@example.com');
  expect(screen.getByLabelText('Shipping Country')).toHaveTextContent('United States');
  expect(screen.getByLabelText('Shipping Subdivision')).toHaveTextContent('California');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
    firstName: 'Alex', lastName: 'Morgan', email: 'demo@example.com', address1: '123 Demo Street',
    city: 'San Francisco', zip: '94105', shippingCountry: 'US', shippingSubdivision: 'CA', shippingOption: 'standard',
  }));
});

test('sample address replaces a saved New York destination after visiting another country', async () => {
  const onSubmit = jest.fn();
  render(<AddressForm checkoutToken={{ id: 'demo_checkout' }} shippingData={{ shippingCountry: 'US', shippingSubdivision: 'NY' }} onSubmit={onSubmit} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  expect(screen.getByLabelText('Shipping Subdivision')).toHaveTextContent('New York');
  fireEvent.mouseDown(screen.getByLabelText('Shipping Country'));
  fireEvent.click(screen.getByRole('option', { name: 'United Kingdom' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());

  fireEvent.click(screen.getByRole('button', { name: 'Use sample address' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  expect(screen.getByLabelText('Shipping Subdivision')).toHaveTextContent('California');
  // A repeated click must also finish its lookups instead of leaving Next disabled.
  fireEvent.click(screen.getByRole('button', { name: 'Use sample address' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ city: 'San Francisco', shippingCountry: 'US', shippingSubdivision: 'CA' })));
});
