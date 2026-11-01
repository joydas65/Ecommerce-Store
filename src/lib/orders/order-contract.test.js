import { isOrderReceipt, isPaidStripeOrder, isSimulatedOrderReceipt, isStripeCheckoutUrl, isStripeOrder, isStripeSessionResult } from './order-contract';

const order = {
  id: 'order_12345678-1234-4123-8123-123456789012', quoteId: 'quote_12345678-1234-4123-8123-123456789012',
  reference: 'TEST-12345678', paymentProvider: 'stripe-test', paymentMode: 'test', status: 'CONFIRMED', paymentStatus: 'PAID',
  createdAt: '2035-01-01T12:00:00Z', expiresAt: '2035-01-31T12:00:00Z', currency: 'USD', pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 1, unitPriceCents: 1200, lineTotalCents: 1200 }],
  shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 1200, taxCents: 136, totalCents: 1836,
};

test.each([['PENDING_PAYMENT', 'PENDING', false], ['CONFIRMED', 'PAID', true], ['CANCELED', 'CANCELED', false], ['PAYMENT_REVIEW', 'REQUIRES_REVIEW', false]])('validates the exact Stripe state pair %s/%s', (status, paymentStatus, paid) => {
  const value = { ...order, status, paymentStatus };
  expect(isStripeOrder(value)).toBe(true);
  expect(isPaidStripeOrder(value)).toBe(paid);
  expect(isOrderReceipt(value)).toBe(paid);
  expect(isSimulatedOrderReceipt(value)).toBe(false);
});

test.each([
  { status: 'CONFIRMED', paymentStatus: 'PENDING' }, { paymentProvider: 'stripe' }, { paymentMode: 'live' },
  { reference: 'DEMO-123' }, { totalCents: 1 }, { taxCents: 0, totalCents: 1700 }, { quoteId: 'quote_bad' },
])('rejects unsupported Stripe proof or corrupted money (%j)', (override) => {
  expect(isStripeOrder({ ...order, ...override })).toBe(false);
  expect(isOrderReceipt({ ...order, ...override })).toBe(false);
});

test.each(['http://checkout.stripe.com/pay', 'https://checkout.stripe.com.attacker.example/pay', 'https://user@checkout.stripe.com/pay', 'https://checkout.stripe.com:8443/pay', '//checkout.stripe.com/pay', 'javascript:alert(1)'])('rejects an untrusted hosted destination: %s', (url) => {
  expect(isStripeCheckoutUrl(url)).toBe(false);
});

test('only pending Stripe sessions may supply a validated hosted checkout URL', () => {
  const url = 'https://checkout.stripe.com/c/pay/cs_test_fixture';
  expect(isStripeCheckoutUrl(url)).toBe(true);
  expect(isStripeSessionResult({ order, checkoutUrl: url })).toBe(false);
  expect(isStripeSessionResult({ order, checkoutUrl: null })).toBe(true);
  expect(isStripeSessionResult({ order: { ...order, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' }, checkoutUrl: url })).toBe(true);
  expect(isStripeSessionResult({ order, checkoutUrl: null }, 'order_another')).toBe(false);
});

test('legacy and tagged simulated receipts remain separate from paid Stripe receipts', () => {
  const simulated = { ...order, reference: 'DEMO-123', paymentProvider: undefined, paymentMode: undefined, paymentStatus: 'SIMULATED' };
  expect(isSimulatedOrderReceipt(simulated)).toBe(true);
  expect(isSimulatedOrderReceipt({ ...simulated, paymentProvider: 'simulated' })).toBe(true);
  expect(isPaidStripeOrder(simulated)).toBe(false);
});
