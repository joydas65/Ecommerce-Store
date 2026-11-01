import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrderReceipt from './OrderReceipt';

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

beforeEach(() => { globalThis.fetch = jest.fn(); });
afterAll(() => { globalThis.fetch = originalFetch; });

test('loads a saved receipt with private uncached access and does not refetch on an unchanged rerender', async () => {
  let resolve;
  fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { rerender } = render(<OrderReceipt orderId={id} />);
  expect(screen.getByRole('heading', { name: 'Loading order' })).toBeVisible();
  expect(fetch).toHaveBeenCalledWith(`/api/demo/orders/${id}`, expect.objectContaining({
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
