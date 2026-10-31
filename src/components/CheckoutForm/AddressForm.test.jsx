import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import AddressForm from './AddressForm';
import { commerce } from '../../lib/commerce';

jest.mock('../../lib/commerce', () => ({
  commerce: {
    services: {
      localeListShippingCountries: jest.fn(),
      localeListSubdivisions: jest.fn(),
    },
    checkout: { getShippingOptions: jest.fn() },
  },
}));

const standard = { id: 'standard', description: 'Standard', price: { formatted_with_symbol: '$5.00' } };
const express = { id: 'express', description: 'Express', price: { formatted_with_symbol: '$10.00' } };
const savedAddress = {
  firstName: 'Joy', lastName: 'Smith', address1: '123 Main Street', email: 'joy@example.com', city: 'Toronto', zip: 'M5V 1A1',
  shippingCountry: 'CA', shippingSubdivision: 'ON', shippingOption: 'express',
};

const renderForm = (props = {}) => render(
  <MemoryRouter>
    <AddressForm checkoutToken={{ id: 'checkout-token' }} onSubmit={jest.fn()} {...props} />
  </MemoryRouter>,
);

const selectCountry = (name) => {
  fireEvent.mouseDown(screen.getByLabelText('Shipping Country'));
  fireEvent.click(screen.getByRole('option', { name }));
};

beforeEach(() => {
  jest.resetAllMocks();
  commerce.services.localeListShippingCountries.mockResolvedValue({ countries: { US: 'United States', CA: 'Canada' } });
  commerce.services.localeListSubdivisions.mockResolvedValue({ subdivisions: { CA: 'California', ON: 'Ontario' } });
  commerce.checkout.getShippingOptions.mockResolvedValue([standard, express]);
});

test('does not allow continuing while shipping choices are loading', async () => {
  let resolveOptions;
  commerce.checkout.getShippingOptions.mockReturnValue(new Promise((resolve) => { resolveOptions = resolve; }));
  const onSubmit = jest.fn();
  renderForm({ onSubmit, shippingData: savedAddress });

  await waitFor(() => expect(commerce.checkout.getShippingOptions).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Next' }).closest('form')); });
  expect(onSubmit).not.toHaveBeenCalled();

  await act(async () => { resolveOptions([standard]); });
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
});

test('loads shipping options for countries without subdivisions', async () => {
  commerce.services.localeListShippingCountries.mockResolvedValue({ countries: { SG: 'Singapore' } });
  commerce.services.localeListSubdivisions.mockResolvedValue({ subdivisions: {} });
  renderForm();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  expect(commerce.checkout.getShippingOptions).toHaveBeenCalledWith('checkout-token', { country: 'SG' });
  expect(screen.queryByLabelText('Shipping Subdivision')).not.toBeInTheDocument();
});

test('shows an empty shipping result and prevents continuing', async () => {
  commerce.checkout.getShippingOptions.mockResolvedValue([]);
  renderForm();

  expect(await screen.findByRole('alert')).toHaveTextContent('No shipping options are available for this address.');
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

test.each([
  ['countries', () => commerce.services.localeListShippingCountries, 'Unable to load shipping countries'],
  ['regions', () => commerce.services.localeListSubdivisions, 'Unable to load shipping regions'],
  ['options', () => commerce.checkout.getShippingOptions, 'Unable to load shipping options'],
])('shows a shipping %s lookup failure and prevents continuing', async (_name, getMock, message) => {
  getMock().mockRejectedValue(new Error('Network unavailable'));
  renderForm();

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});

test('restores saved address fields and shipping selections when returning from payment', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  renderForm({ shippingData: savedAddress, onSubmit });

  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  expect(screen.getByLabelText(/First name/)).toHaveValue('Joy');
  expect(screen.getByLabelText(/Address line 1/)).toHaveValue('123 Main Street');
  expect(screen.getByLabelText(/Email/)).toHaveValue('joy@example.com');
  expect(screen.getByLabelText('Shipping Country')).toHaveTextContent('Canada');
  expect(screen.getByLabelText('Shipping Subdivision')).toHaveTextContent('Ontario');
  expect(screen.getByLabelText('Shipping Options')).toHaveTextContent('Express');

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(savedAddress));
});

test('can retry a failed shipping lookup without losing entered address fields', async () => {
  commerce.checkout.getShippingOptions.mockRejectedValueOnce(new Error('Network unavailable'));
  renderForm({ shippingData: savedAddress });

  fireEvent.click(await screen.findByRole('button', { name: 'Retry shipping' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/First name/)).toHaveValue('Joy');
});

test('ignores regions returned for a previously selected country', async () => {
  let resolveOldRegions;
  commerce.services.localeListSubdivisions.mockImplementation((country) => country === 'US'
    ? new Promise((resolve) => { resolveOldRegions = resolve; })
    : Promise.resolve({ subdivisions: {} }));
  renderForm();

  await waitFor(() => expect(commerce.services.localeListSubdivisions).toHaveBeenCalledWith('US'));
  selectCountry('Canada');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  await act(async () => { resolveOldRegions({ subdivisions: { CA: 'California' } }); });

  expect(screen.getByLabelText('Shipping Country')).toHaveTextContent('Canada');
  expect(screen.queryByLabelText('Shipping Subdivision')).not.toBeInTheDocument();
  expect(commerce.checkout.getShippingOptions).toHaveBeenCalledTimes(1);
  expect(commerce.checkout.getShippingOptions).toHaveBeenCalledWith('checkout-token', { country: 'CA' });
});

test('ignores shipping options returned for a previously selected country', async () => {
  let resolveOldOptions;
  commerce.services.localeListSubdivisions.mockResolvedValue({ subdivisions: {} });
  commerce.checkout.getShippingOptions.mockImplementation((_token, { country }) => country === 'US'
    ? new Promise((resolve) => { resolveOldOptions = resolve; })
    : Promise.resolve([express]));
  renderForm();

  await waitFor(() => expect(commerce.checkout.getShippingOptions).toHaveBeenCalledWith('checkout-token', { country: 'US' }));
  selectCountry('Canada');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  await act(async () => { resolveOldOptions([standard]); });

  expect(screen.getByLabelText('Shipping Options')).toHaveTextContent('Express');
  expect(screen.getByLabelText('Shipping Options')).not.toHaveTextContent('Standard');
});

test('keeps address controls disabled while the parent recalculates the total', async () => {
  renderForm({ shippingData: savedAddress, isSubmitting: true, error: 'The total could not be updated.' });

  await waitFor(() => expect(screen.getByLabelText('Shipping Options')).toHaveTextContent('Express'));
  expect(screen.getByRole('button', { name: 'Updating total…' })).toBeDisabled();
  expect(screen.getByLabelText(/First name/)).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('The total could not be updated.');
});
