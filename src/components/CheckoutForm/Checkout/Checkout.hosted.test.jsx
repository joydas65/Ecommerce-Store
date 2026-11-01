import { fireEvent, render, screen } from '@testing-library/react';
import Checkout from './Checkout';
import { commerce } from '../../../lib/commerce';

jest.mock('../../../lib/storefront-config', () => ({ usesHostedStripe: true, usesSimulatedPayment: false, usesPersistentOrders: true, usesSeededCatalog: true }));
jest.mock('../../../lib/commerce', () => ({ commerce: { checkout: {
  pending: jest.fn(), generateToken: jest.fn(), checkShippingOption: jest.fn(), setTaxZone: jest.fn(),
} } }));
jest.mock('@stripe/stripe-js/pure', () => ({ loadStripe: jest.fn() }));
jest.mock('../AddressForm', () => function MockAddress({ onSubmit }) {
  return <button onClick={() => onSubmit({ shippingCountry: 'US', shippingSubdivision: 'CA', shippingOption: 'demo-standard', zip: '94103' })}>Continue with sample address</button>;
});

const money = (raw) => ({ raw, formatted_with_symbol: `$${raw.toFixed(2)}` });
const token = { id: 'token', live: { line_items: [{ id: 'line', name: 'Notebook', quantity: 1, line_total: money(12) }],
  subtotal: money(12), shipping: { price: money(5) }, tax: { amount: money(1.36) }, total_with_tax: money(18.36) } };
const cart = { id: 'cart', line_items: token.live.line_items, total_items: 1 };
const pending = { orderId: 'order_12345678-1234-4123-8123-123456789012', quoteId: 'quote_12345678-1234-4123-8123-123456789012' };
const order = (status = 'PENDING_PAYMENT') => ({
  id: pending.orderId, quoteId: pending.quoteId, reference: 'TEST-12345678', paymentProvider: 'stripe-test', paymentMode: 'test',
  status, paymentStatus: { PENDING_PAYMENT: 'PENDING', CONFIRMED: 'PAID', CANCELED: 'CANCELED', PAYMENT_REVIEW: 'REQUIRES_REVIEW' }[status],
  createdAt: '2035-01-01T12:00:00Z', expiresAt: '2035-01-31T12:00:00Z', currency: 'USD', pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 1, unitPriceCents: 1200, lineTotalCents: 1200 }],
  shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 1200, taxCents: 136, totalCents: 1836,
});
const envelope = (status) => ({ order: order(status), checkoutUrl: null });
const receipt = { id: pending.orderId, customer_reference: 'TEST-12345678', demo: false, persistent: true,
  payment_provider: 'stripe-test', payment_mode: 'test', status_payment: 'paid', receipt_url: `/orders/${pending.orderId}` };

function setup(overrides = {}) {
  const props = { cart, onStartPayment: jest.fn(), onResumePayment: jest.fn(), onCompletePayment: jest.fn().mockResolvedValue(receipt), ...overrides };
  render(<Checkout {...props} />);
  return props;
}
async function goToPayment() {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with sample address' }));
  return screen.findByRole('button', { name: 'Continue to Stripe test checkout' });
}
beforeEach(() => {
  jest.resetAllMocks();
  commerce.checkout.pending.mockResolvedValue(null);
  commerce.checkout.generateToken.mockResolvedValue(token);
  commerce.checkout.checkShippingOption.mockResolvedValue({ valid: true });
  commerce.checkout.setTaxZone.mockResolvedValue({ valid: true, live: token.live });
});

test('a canceled replay at the payment step remounts fresh shipping instead of remaining locked', async () => {
  const props = setup({ onStartPayment: jest.fn().mockResolvedValue(envelope('CANCELED')) });
  fireEvent.click(await goToPayment());
  expect(await screen.findByRole('button', { name: 'Continue with sample address' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('previous Stripe checkout was canceled');
  expect(screen.queryByRole('button', { name: 'Opening Stripe checkout…' })).not.toBeInTheDocument();
  expect(commerce.checkout.generateToken).toHaveBeenCalledTimes(2);
  expect(props.onCompletePayment).not.toHaveBeenCalled();
  expect(await goToPayment()).toBeEnabled();
});

test('a lost session response moves directly to the saved recovery view without a success claim', async () => {
  commerce.checkout.pending.mockResolvedValueOnce(null).mockResolvedValue(pending);
  const props = setup({ onStartPayment: jest.fn().mockRejectedValue(new Error('Resume the saved checkout; its response was lost.')) });
  fireEvent.click(await goToPayment());
  expect(await screen.findByRole('heading', { name: 'Resume your Stripe test checkout' })).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('response was lost');
  expect(screen.getByRole('link', { name: 'View payment status' })).toHaveAttribute('href', `/orders/${pending.orderId}`);
  expect(props.onCompletePayment).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Stripe test order complete' })).not.toBeInTheDocument();
});

test('a pending or review recovery never invokes payment completion', async () => {
  commerce.checkout.pending.mockResolvedValue(pending);
  const props = setup({ onResumePayment: jest.fn().mockResolvedValue(envelope('PAYMENT_REVIEW')) });
  fireEvent.click(await screen.findByRole('button', { name: 'Resume Stripe checkout' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('needs review');
  expect(screen.getByRole('button', { name: 'Resume Stripe checkout' })).toBeEnabled();
  expect(commerce.checkout.generateToken).not.toHaveBeenCalled();
  expect(props.onCompletePayment).not.toHaveBeenCalled();
});

test('a server-verified paid replay goes through payment completion before showing success', async () => {
  commerce.checkout.pending.mockResolvedValue(pending);
  const props = setup({ onResumePayment: jest.fn().mockResolvedValue(envelope('CONFIRMED')) });
  fireEvent.click(await screen.findByRole('button', { name: 'Resume Stripe checkout' }));
  expect(await screen.findByRole('heading', { name: 'Stripe test order complete' })).toBeVisible();
  expect(props.onCompletePayment).toHaveBeenCalledWith(order('CONFIRMED'));
  expect(screen.getByRole('link', { name: 'View saved receipt' })).toHaveAttribute('href', receipt.receipt_url);
});

test('an invalid hosted URL is rejected and retains recovery instead of navigating or confirming', async () => {
  commerce.checkout.pending.mockResolvedValueOnce(null).mockResolvedValue(pending);
  const props = setup({ onStartPayment: jest.fn().mockResolvedValue({ ...envelope('PENDING_PAYMENT'), checkoutUrl: 'https://attacker.example/pay' }) });
  fireEvent.click(await goToPayment());
  expect(await screen.findByRole('alert')).toHaveTextContent('valid Stripe checkout');
  expect(screen.getByRole('heading', { name: 'Resume your Stripe test checkout' })).toBeVisible();
  expect(props.onCompletePayment).not.toHaveBeenCalled();
});

test('a definitively expired quote starts fresh shipping with a clear notice', async () => {
  const props = setup({ onStartPayment: jest.fn().mockRejectedValue(Object.assign(new Error('Expired'), { code: 'QUOTE_EXPIRED' })) });
  fireEvent.click(await goToPayment());
  expect(await screen.findByRole('button', { name: 'Continue with sample address' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('quote expired before payment');
  expect(commerce.checkout.generateToken).toHaveBeenCalledTimes(2);
  expect(props.onCompletePayment).not.toHaveBeenCalled();
});
