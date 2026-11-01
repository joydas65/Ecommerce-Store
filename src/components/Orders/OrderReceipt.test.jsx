import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrderReceipt from './OrderReceipt';

const mockCompletePayment = jest.fn();
const mockCanceledPayment = jest.fn();
let mockHostedStripe = false;
jest.mock('../../lib/storefront-config', () => ({ get usesHostedStripe() { return mockHostedStripe; } }));
jest.mock('../../context/CommerceContext', () => ({ useCommerce: () => ({
  handleCompletePayment: mockCompletePayment, handleCanceledPayment: mockCanceledPayment,
}) }));

const id = 'order_12345678-1234-4123-8123-123456789012';
const anotherId = 'order_87654321-1234-4123-8123-123456789012';
const receipt = {
  id,
  reference: 'DEMO-12345678',
  quoteId: 'quote_12345678-1234-4123-8123-123456789012',
  status: 'CONFIRMED',
  paymentStatus: 'SIMULATED',
  createdAt: '2026-11-01T12:00:00Z',
  expiresAt: '2026-12-01T12:00:00Z',
  currency: 'USD',
  pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 2, unitPriceCents: 1200, lineTotalCents: 2400 }],
  shippingMethod: 'demo-standard',
  shippingCents: 500,
  subtotalCents: 2400,
  taxCents: 232,
  totalCents: 3132,
};
const response = (data = receipt) => ({ ok: true, status: 200, json: async () => data });
const originalFetch = globalThis.fetch;
const stripeOrder = (status = 'PENDING_PAYMENT') => ({ ...receipt, reference: 'TEST-12345678',
  paymentProvider: 'stripe-test', paymentMode: 'test', status,
  paymentStatus: { PENDING_PAYMENT: 'PENDING', CONFIRMED: 'PAID', CANCELED: 'CANCELED', PAYMENT_REVIEW: 'REQUIRES_REVIEW' }[status],
});
const stripeSession = (status = 'PENDING_PAYMENT') => ({ order: stripeOrder(status), checkoutUrl: status === 'PENDING_PAYMENT' ? 'https://checkout.stripe.com/c/pay/cs_test_fixture' : null });

beforeEach(() => {
  globalThis.fetch = jest.fn();
  mockHostedStripe = false;
  mockCompletePayment.mockReset();
  mockCanceledPayment.mockReset();
});
afterAll(() => { globalThis.fetch = originalFetch; });

test('reconciles pending Stripe once without claiming success or clearing the cart', async () => {
  mockHostedStripe = true;
  fetch.mockResolvedValueOnce(response(stripeOrder())).mockResolvedValue(response(stripeSession()));
  const { rerender } = render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Payment awaiting confirmation' })).toBeVisible();
  expect(fetch).toHaveBeenNthCalledWith(2, `/api/orders/${id}/reconcile`, expect.objectContaining({ method: 'POST', body: '{}', cache: 'no-store', credentials: 'same-origin' }));
  expect(screen.getByRole('button', { name: 'Resume Stripe checkout' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel checkout' })).toBeEnabled();
  expect(screen.queryByRole('heading', { name: 'Stripe test order complete' })).not.toBeInTheDocument();
  expect(mockCompletePayment).not.toHaveBeenCalled();
  rerender(<OrderReceipt orderId={id} />);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('a fresh verified paid reconciliation updates receipt and completes only that order', async () => {
  mockHostedStripe = true;
  fetch.mockResolvedValueOnce(response(stripeOrder())).mockResolvedValueOnce(response(stripeSession()))
    .mockResolvedValueOnce(response(stripeSession('CONFIRMED')));
  render(<OrderReceipt orderId={id} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check payment status' }));
  expect(await screen.findByRole('heading', { name: 'Stripe test order complete' })).toBeVisible();
  expect(mockCompletePayment).toHaveBeenCalledTimes(1);
  expect(mockCompletePayment).toHaveBeenCalledWith(stripeOrder('CONFIRMED'));
  expect(screen.queryByRole('button', { name: 'Resume Stripe checkout' })).not.toBeInTheDocument();
});

test('cancel waits for a server-confirmed cancellation and releases recovery without confirming payment', async () => {
  mockHostedStripe = true;
  let resolve;
  fetch.mockResolvedValueOnce(response(stripeOrder())).mockResolvedValueOnce(response(stripeSession()))
    .mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  render(<OrderReceipt orderId={id} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel checkout' }));
  expect(screen.getByRole('button', { name: 'Cancel checkout' })).toBeDisabled();
  expect(screen.getByRole('heading', { name: 'Payment awaiting confirmation' })).toBeVisible();
  expect(mockCanceledPayment).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenLastCalledWith(`/api/orders/${id}/cancel`, expect.objectContaining({ method: 'POST', body: '{}' }));
  await act(async () => resolve(response(stripeSession('CANCELED'))));
  expect(await screen.findByRole('heading', { name: 'Checkout canceled' })).toBeVisible();
  expect(mockCanceledPayment).toHaveBeenCalledWith(stripeOrder('CANCELED'));
  expect(mockCompletePayment).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Return to checkout' })).toHaveAttribute('href', '/checkout');
});

test('payment review retains cart and only offers an explicit status check', async () => {
  mockHostedStripe = true;
  fetch.mockResolvedValue(response(stripeOrder('PAYMENT_REVIEW')));
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Payment needs review' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Check payment status' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Resume Stripe checkout' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel checkout' })).not.toBeInTheDocument();
  expect(mockCompletePayment).not.toHaveBeenCalled();
  expect(mockCanceledPayment).not.toHaveBeenCalled();
});

test('failed or malformed reconciliation retains the known pending order and permits checking again', async () => {
  mockHostedStripe = true;
  fetch.mockResolvedValueOnce(response(stripeOrder()))
    .mockResolvedValueOnce(response({ ...stripeSession(), checkoutUrl: 'https://attacker.example/pay' }))
    .mockResolvedValueOnce(response(stripeSession()));
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Payment awaiting confirmation' })).toBeVisible();
  expect(screen.getByText(/Payment status is temporarily unavailable/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Resume Stripe checkout' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
  expect(await screen.findByRole('button', { name: 'Resume Stripe checkout' })).toBeEnabled();
  expect(mockCompletePayment).not.toHaveBeenCalled();
});

test('browser cleanup failure does not misrepresent a server-verified paid receipt as payment failure', async () => {
  mockHostedStripe = true;
  mockCompletePayment.mockRejectedValue(new Error('Storage blocked'));
  fetch.mockResolvedValue(response(stripeOrder('CONFIRMED')));
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Stripe test order complete' })).toBeVisible();
  expect(screen.getByText(/this browser could not update its checkout/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
  { ...stripeOrder('CONFIRMED'), paymentMode: 'live' },
  { ...stripeOrder('CONFIRMED'), paymentStatus: 'PENDING' },
  { ...stripeOrder('CONFIRMED'), paymentProvider: undefined },
])('rejects an invalid Stripe snapshot without a success claim (%j)', async (value) => {
  mockHostedStripe = true;
  fetch.mockResolvedValue(response(value));
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Order unavailable' })).toBeVisible();
  expect(mockCompletePayment).not.toHaveBeenCalled();
});

test('loads a saved receipt with private uncached access and does not refetch on an unchanged rerender', async () => {
  let resolve;
  fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { rerender } = render(<OrderReceipt orderId={id} />);
  expect(screen.getByRole('heading', { name: 'Loading order' })).toBeVisible();
  expect(fetch).toHaveBeenCalledWith(`/api/orders/${id}`, expect.objectContaining({
    cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal),
  }));
  await act(async () => { resolve(response()); });

  expect(await screen.findByRole('heading', { name: 'Demo order complete' })).toBeVisible();
  expect(screen.getByText('Order ref: DEMO-12345678')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('No payment was collected and nothing will be shipped.');
  expect(within(screen.getByRole('list', { name: 'Order items' })).getByText('Quantity: 2 · $12.00 each')).toBeVisible();
  const totals = screen.getByRole('list', { name: 'Order totals' });
  expect(totals).toHaveTextContent('Standard shipping$5.00');
  expect(totals).toHaveTextContent('Sample tax (8%)$2.32');
  expect(totals).toHaveTextContent('Total$31.32');
  expect(screen.getByRole('link', { name: 'Back to store' })).toHaveAttribute('href', '/');
  rerender(<OrderReceipt orderId={id} />);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('shows the same not-found state for an unavailable or unauthorized receipt', async () => {
  fetch.mockResolvedValue({ ok: false, status: 404, json: jest.fn() });
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Demo order complete' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

test.each([
  ['service failure', () => Promise.resolve({ ok: false, status: 503 })],
  ['network failure', () => Promise.reject(new Error('Offline'))],
  ['invalid JSON', () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('Invalid JSON'); } })],
])('recovers from %s with a fresh request', async (label, request) => {
  fetch.mockImplementationOnce(request).mockResolvedValueOnce(response());
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Order unavailable' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Demo order complete' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { name: 'Demo order complete' })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([
  ['missing body', null],
  ['another order', { ...receipt, id: anotherId }],
  ['unconfirmed order', { ...receipt, status: 'PENDING' }],
  ['real payment', { ...receipt, paymentStatus: 'PAID' }],
  ['empty items', { ...receipt, items: [] }],
  ['incorrect total', { ...receipt, totalCents: 1 }],
  ['inconsistent line item', { ...receipt, items: [{ ...receipt.items[0], quantity: 3 }] }],
  ['unsafe amount', { ...receipt, shippingCents: Number.MAX_SAFE_INTEGER + 1 }],
  ['invalid dates', { ...receipt, createdAt: 'not a date' }],
])('does not claim confirmation for a malformed receipt: %s', async (label, data) => {
  fetch.mockResolvedValue(response(data));
  render(<OrderReceipt orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Order unavailable' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Demo order complete' })).not.toBeInTheDocument();
});

test('aborts obsolete requests and ignores late responses when navigating to another receipt', async () => {
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise((done) => { resolveOld = done; }))
    .mockResolvedValueOnce(response({ ...receipt, id: anotherId, reference: 'DEMO-SECOND' }));
  const { rerender, unmount } = render(<OrderReceipt orderId={id} />);
  const oldSignal = fetch.mock.calls[0][1].signal;
  rerender(<OrderReceipt orderId={anotherId} />);
  expect(oldSignal.aborted).toBe(true);
  expect(await screen.findByText('Order ref: DEMO-SECOND')).toBeVisible();
  await act(async () => { resolveOld(response()); });
  expect(screen.queryByText('Order ref: DEMO-12345678')).not.toBeInTheDocument();
  expect(screen.getByText('Order ref: DEMO-SECOND')).toBeVisible();
  const currentSignal = fetch.mock.calls[1][1].signal;
  unmount();
  await waitFor(() => expect(currentSignal.aborted).toBe(true));
});
