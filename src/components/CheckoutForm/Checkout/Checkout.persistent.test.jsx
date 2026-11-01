import { act, fireEvent, render, screen } from '@testing-library/react';
import Checkout from './Checkout';
import { commerce } from '../../../lib/commerce';

jest.mock('../../../lib/commerce-mode', () => ({ isDemoMode: true, isPersistentDemo: true }));
jest.mock('../../../lib/commerce', () => ({ commerce: { checkout: {
  pending: jest.fn(), generateToken: jest.fn(), checkShippingOption: jest.fn(), setTaxZone: jest.fn(),
} } }));
jest.mock('@stripe/stripe-js/pure', () => ({ loadStripe: jest.fn() }));
jest.mock('../AddressForm', () => function MockAddress({ onSubmit }) {
  return <button onClick={() => onSubmit(mockAddress)}>Continue with sample address</button>;
});

const mockAddress = {
  firstName: 'Alex', lastName: 'Example', email: 'demo@example.com', address1: '123 Sample Street',
  city: 'San Francisco', zip: '94103', shippingCountry: 'US', shippingSubdivision: 'CA', shippingOption: 'demo-standard',
};
const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });
const token = { id: 'demo-checkout-1', live: {
  line_items: [{ id: 'line-demo-notebook', name: 'Notebook', quantity: 1, line_total: money(12) }],
  subtotal: money(12), shipping: { price: money(5) }, tax: { amount: money(1.36) }, total_with_tax: money(18.36),
} };
const pending = { version: 1, quoteId: 'quote_fixture', key: 'attempt_fixture', cart: { id: 'cart_fixture', revision: 1 } };
const receipt = { id: 'order_fixture', customer_reference: 'DEMO-RECEIPT', demo: true, persistent: true, receipt_url: '/orders/order_fixture', status_payment: 'simulated' };
const cart = { id: 'cart_fixture', line_items: token.live.line_items, total_items: 1 };

function renderCheckout(overrides = {}) {
  const props = { cart, onCaptureCheckout: jest.fn(), onRecoverCheckout: jest.fn(), ...overrides };
  return { ...render(<Checkout {...props} />), ...props };
}

async function goToPayment() {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with sample address' }));
  return screen.findByRole('button', { name: 'Place demo order — $18.36' });
}

beforeEach(() => {
  jest.resetAllMocks();
  commerce.checkout.pending.mockResolvedValue(null);
  commerce.checkout.generateToken.mockResolvedValue(token);
  commerce.checkout.checkShippingOption.mockResolvedValue({ valid: true });
  commerce.checkout.setTaxZone.mockResolvedValue({ valid: true, live: token.live });
});

test('blocks a new checkout until the previous-attempt check resolves', async () => {
  let resolvePending;
  commerce.checkout.pending.mockReturnValue(new Promise((resolve) => { resolvePending = resolve; }));
  renderCheckout();
  expect(screen.getByRole('progressbar', { name: 'Checking previous checkout' })).toBeVisible();
  expect(commerce.checkout.generateToken).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Continue with sample address' })).not.toBeInTheDocument();

  await act(async () => resolvePending(pending));
  expect(await screen.findByRole('button', { name: 'Recover pending order' })).toBeEnabled();
  expect(commerce.checkout.generateToken).not.toHaveBeenCalled();
});

test('starts a fresh checkout only when there is no previous attempt', async () => {
  renderCheckout();
  expect(await screen.findByRole('button', { name: 'Continue with sample address' })).toBeEnabled();
  expect(commerce.checkout.generateToken).toHaveBeenCalledWith(cart.id, { type: 'cart' });
  expect(screen.queryByRole('button', { name: 'Recover pending order' })).not.toBeInTheDocument();
});

test('fails closed on an unexpected pending-check error and permits a safe recheck', async () => {
  commerce.checkout.pending.mockRejectedValueOnce(new Error('Unexpected storage failure')).mockResolvedValueOnce(null);
  const props = renderCheckout();
  expect(await screen.findByRole('alert')).toHaveTextContent('We could not check your previous checkout.');
  expect(screen.getByRole('button', { name: 'Recover pending order' })).toBeDisabled();
  expect(commerce.checkout.generateToken).not.toHaveBeenCalled();
  expect(props.onCaptureCheckout).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Retry recovery check' }));
  expect(await screen.findByRole('button', { name: 'Continue with sample address' })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('switches a lost capture response to recovery immediately and confirms only the recovered receipt', async () => {
  commerce.checkout.pending.mockResolvedValueOnce(null).mockResolvedValueOnce(pending);
  const onCaptureCheckout = jest.fn().mockRejectedValue(new Error('The response was lost. Your order may already be saved.'));
  const onRecoverCheckout = jest.fn().mockResolvedValue(receipt);
  renderCheckout({ onCaptureCheckout, onRecoverCheckout });
  fireEvent.click(await goToPayment());

  const recoverButton = await screen.findByRole('button', { name: 'Recover pending order' });
  expect(recoverButton).toBeEnabled();
  expect(screen.queryByRole('button', { name: /^Place demo order/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Demo order complete' })).not.toBeInTheDocument();
  fireEvent.click(recoverButton);
  expect(await screen.findByRole('heading', { name: 'Demo order complete' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'View saved receipt' })).toHaveAttribute('href', receipt.receipt_url);
  expect(onCaptureCheckout).toHaveBeenCalledTimes(1);
  expect(onRecoverCheckout).toHaveBeenCalledTimes(1);
});

test('keeps the payment step available after a controlled failure with no pending attempt', async () => {
  const onCaptureCheckout = jest.fn().mockRejectedValueOnce(new Error('Simulated payment failure.')).mockResolvedValueOnce(receipt);
  renderCheckout({ onCaptureCheckout });
  fireEvent.click(await goToPayment());
  expect(await screen.findByRole('alert')).toHaveTextContent('Simulated payment failure.');
  expect(screen.queryByRole('button', { name: 'Recover pending order' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Place demo order — $18.36' }));
  expect(await screen.findByRole('heading', { name: 'Demo order complete' })).toBeVisible();
  expect(onCaptureCheckout).toHaveBeenCalledTimes(2);
});

test('returns an expired recovery to a fresh shipping review with an actionable message', async () => {
  commerce.checkout.pending.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
  const expired = Object.assign(new Error('Your quote expired.'), { code: 'QUOTE_EXPIRED' });
  const props = renderCheckout({ onRecoverCheckout: jest.fn().mockRejectedValue(expired) });
  fireEvent.click(await screen.findByRole('button', { name: 'Recover pending order' }));

  expect(await screen.findByRole('button', { name: 'Continue with sample address' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Your quote expired. Review your shipping details below before starting a new checkout.');
  expect(screen.queryByRole('button', { name: 'Recover pending order' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Demo order complete' })).not.toBeInTheDocument();
  expect(props.onCaptureCheckout).not.toHaveBeenCalled();
});

test('retains an ambiguous recovery attempt and lets the same recovery be retried', async () => {
  commerce.checkout.pending.mockResolvedValue(pending);
  const onRecoverCheckout = jest.fn().mockRejectedValueOnce(new Error('The order service is unavailable.')).mockResolvedValueOnce(receipt);
  renderCheckout({ onRecoverCheckout });
  fireEvent.click(await screen.findByRole('button', { name: 'Recover pending order' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The order service is unavailable.');
  expect(screen.getByRole('button', { name: 'Recover pending order' })).toBeEnabled();
  expect(commerce.checkout.generateToken).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Recover pending order' }));
  expect(await screen.findByRole('heading', { name: 'Demo order complete' })).toBeVisible();
  expect(onRecoverCheckout).toHaveBeenCalledTimes(2);
});
