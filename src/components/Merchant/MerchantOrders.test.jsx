import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MerchantOrderInbox from './MerchantOrderInbox';
import MerchantOrderDetail from './MerchantOrderDetail';

const mockPush = jest.fn((href) => window.history.pushState(null, '', href));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: mockPush }),
}));

const id = 'order_12345678-1234-4123-8123-123456789012';
const secondId = 'order_87654321-1234-4123-8123-123456789012';
const receipt = {
  id, reference: 'TEST-12345678', quoteId: 'quote_12345678-1234-4123-8123-123456789012',
  status: 'CONFIRMED', paymentStatus: 'PAID', paymentProvider: 'stripe-test', paymentMode: 'test',
  createdAt: '2026-11-01T12:00:00Z', expiresAt: '2026-12-01T12:00:00Z', currency: 'USD', pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 2, unitPriceCents: 1200, lineTotalCents: 2400 }],
  shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 2400, taxCents: 232, totalCents: 3132,
};
const summary = { id, reference: receipt.reference, status: receipt.status, paymentStatus: receipt.paymentStatus,
  paymentProvider: receipt.paymentProvider, paymentMode: receipt.paymentMode, createdAt: receipt.createdAt,
  currency: receipt.currency, totalCents: receipt.totalCents, itemCount: 2 };
const pending = { ...summary, id: secondId, reference: 'TEST-87654321', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' };
const page = (orders = [summary], nextCursor = null) => ({ orders, pageInfo: { nextCursor, hasMore: nextCursor !== null } });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = jest.fn();
  window.history.replaceState(null, '', '/admin/orders');
  mockPush.mockClear();
});
afterAll(() => { globalThis.fetch = originalFetch; });

function renderInbox(url = '/admin/orders') {
  window.history.replaceState(null, '', url);
  const view = render(<MerchantOrderInbox />);
  return { ...view, refreshURL: (next) => act(() => {
    if (next) window.history.replaceState(null, '', next);
    view.rerender(<MerchantOrderInbox />);
  }) };
}

test('loads an uncached merchant inbox with accurate payment, provider, total, and private detail links', async () => {
  fetch.mockResolvedValue(response(page([summary, pending])));
  const view = renderInbox();
  expect(screen.getByRole('status')).toHaveTextContent('Loading orders');
  const table = await screen.findByRole('table', { name: 'Merchant orders' });
  expect(within(table).getByText('Paid')).toBeVisible();
  expect(within(table).getByText('Pending')).toBeVisible();
  expect(within(table).getAllByText('Stripe test')).toHaveLength(2);
  expect(within(table).getAllByText('$31.32')).toHaveLength(2);
  expect(within(table).getByRole('link', { name: summary.reference })).toHaveAttribute('href', `/admin/orders/${id}`);
  expect(screen.getByText('2 orders on this page')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Older orders' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledWith('/api/merchant/orders?status=all&limit=20', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal) }));
  view.refreshURL();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('restores payment filtering from a shared URL and resets cursor when the filter changes', async () => {
  fetch.mockResolvedValue(response(page()));
  const user = userEvent.setup();
  const view = renderInbox('/admin/orders?status=paid&cursor=opaque-cursor');
  await screen.findByRole('table');
  expect(screen.getByRole('combobox', { name: 'Payment status' })).toHaveValue('paid');
  expect(fetch).toHaveBeenLastCalledWith('/api/merchant/orders?status=paid&limit=20&cursor=opaque-cursor', expect.any(Object));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Payment status' }), 'pending');
  expect(mockPush).toHaveBeenLastCalledWith('/admin/orders?status=pending');
  fetch.mockResolvedValue(response(page([pending])));
  view.refreshURL();
  expect(await screen.findByText('1 order on this page · Pending')).toBeVisible();
  expect(fetch).toHaveBeenLastCalledWith('/api/merchant/orders?status=pending&limit=20', expect.any(Object));
});

test('uses server cursors and returns to the known newer page without guessing a cursor', async () => {
  fetch.mockResolvedValueOnce(response(page([summary], 'server-cursor'))).mockResolvedValue(response(page([pending])));
  const view = renderInbox('/admin/orders?status=paid');
  fireEvent.click(await screen.findByRole('button', { name: 'Older orders' }));
  expect(mockPush).toHaveBeenLastCalledWith('/admin/orders?status=paid&cursor=server-cursor');
  view.refreshURL();
  fireEvent.click(await screen.findByRole('button', { name: 'Newer orders' }));
  expect(mockPush).toHaveBeenLastCalledWith('/admin/orders?status=paid');
});

test('a directly opened cursor page offers an explicit link back to the newest page', async () => {
  fetch.mockResolvedValue(response(page()));
  renderInbox('/admin/orders?status=paid&cursor=server-cursor');
  fireEvent.click(await screen.findByRole('button', { name: 'Newest orders' }));
  expect(mockPush).toHaveBeenLastCalledWith('/admin/orders?status=paid');
});

test('renders an empty first inbox with a useful storefront action', async () => {
  fetch.mockResolvedValue(response(page([])));
  renderInbox();
  expect(await screen.findByRole('heading', { name: 'Your order inbox is ready' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Browse the storefront' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('empty filtered results can return to all payments', async () => {
  fetch.mockResolvedValue(response(page([])));
  renderInbox('/admin/orders?status=review');
  expect(await screen.findByRole('heading', { name: 'No orders need review' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'View all payments' }));
  expect(mockPush).toHaveBeenLastCalledWith('/admin/orders');
});

test.each([
  [401, 'Sign in to continue', 'Merchant sign in', '/admin/sign-in'],
  [403, 'Merchant access required', 'Back to store', '/'],
  [400, 'This order view is unavailable', 'Back to orders', '/admin/orders'],
])('handles inbox HTTP %s without displaying order data', async (status, title, action, href) => {
  fetch.mockResolvedValue(response(page(), status));
  renderInbox();
  expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  expect(screen.getByRole('link', { name: action })).toHaveAttribute('href', href);
  expect(screen.queryByText(summary.reference)).not.toBeInTheDocument();
});

test.each(['/admin/orders?status=unknown', '/admin/orders?status=paid&status=pending', '/admin/orders?cursor=%3Cscript%3E'])('rejects an invalid shared URL without sending an order request: %s', (url) => {
  renderInbox(url);
  expect(screen.getByRole('heading', { name: 'This order view is unavailable' })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

test('a temporary list failure offers a retry and then renders the saved data', async () => {
  fetch.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(response(page()));
  renderInbox();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('table')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([
  page([{ ...summary, status: 'PENDING_PAYMENT' }]),
  page([{ ...summary, paymentMode: 'live' }]),
  page([{ ...summary, totalCents: -1 }]),
  page([summary, summary]),
  { ...page(), pageInfo: { nextCursor: 'https://example.com', hasMore: true } },
])('fails closed on an invalid merchant list response (%j)', async (value) => {
  fetch.mockResolvedValue(response(value));
  renderInbox();
  expect(await screen.findByRole('heading', { name: 'Orders temporarily unavailable' })).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a stale response cannot replace the currently selected status or reveal prior results', async () => {
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(response(page([pending])));
  const view = renderInbox('/admin/orders?status=paid');
  view.refreshURL('/admin/orders?status=pending');
  expect(await screen.findByRole('link', { name: pending.reference })).toBeVisible();
  await act(async () => resolveOld(response(page())));
  expect(screen.queryByRole('link', { name: summary.reference })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Payment status' })).toHaveValue('pending');
});

test('refreshing a loaded inbox hides old rows while obtaining a fresh authorization result', async () => {
  let resolveRefresh;
  fetch.mockResolvedValueOnce(response(page())).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
  renderInbox();
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh orders' }));
  expect(screen.queryByText(summary.reference)).not.toBeInTheDocument();
  await act(async () => resolveRefresh(response(null, 403)));
  expect(await screen.findByRole('heading', { name: 'Merchant access required' })).toBeVisible();
});

test('renders all five payment states without presenting simulation as a paid Stripe order', async () => {
  const orders = [
    summary,
    pending,
    { ...summary, id: 'order_33333333-1234-4123-8123-123456789012', reference: 'TEST-33333333', status: 'PAYMENT_REVIEW', paymentStatus: 'REQUIRES_REVIEW' },
    { ...summary, id: 'order_44444444-1234-4123-8123-123456789012', reference: 'TEST-44444444', status: 'CANCELED', paymentStatus: 'CANCELED' },
    { ...summary, id: 'order_55555555-1234-4123-8123-123456789012', reference: 'DEMO-55555555', paymentStatus: 'SIMULATED', paymentProvider: 'simulated', paymentMode: undefined },
  ];
  fetch.mockResolvedValue(response(page(orders)));
  renderInbox();
  const table = await screen.findByRole('table');
  for (const label of ['Paid', 'Pending', 'Needs review', 'Canceled', 'Simulated']) expect(within(table).getByText(label)).toBeVisible();
  expect(within(table).getByText('Simulation')).toBeVisible();
});

test('detail displays authoritative shipping, tax, totals, provider and timestamps without any write requests', async () => {
  fetch.mockResolvedValue(response(receipt));
  render(<MerchantOrderDetail orderId={id} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading order details');
  expect(await screen.findByRole('heading', { name: 'Items & totals' })).toBeVisible();
  expect(screen.getByText('Notebook')).toBeVisible();
  expect(screen.getByText('Quantity 2 · $12.00 each')).toBeVisible();
  expect(screen.getByText('Standard shipping')).toBeVisible();
  expect(screen.getByText('$5.00')).toBeVisible();
  expect(screen.getByText('$2.32')).toBeVisible();
  expect(screen.getByText('$31.32')).toBeVisible();
  expect(screen.getByText('Paid')).toBeVisible();
  expect(screen.getByText('Stripe test')).toBeVisible();
  expect(screen.getByText('Nov 1, 2026, 12:00 PM UTC')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(`/api/merchant/orders/${id}`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }));
  expect(screen.queryByRole('button', { name: /cancel|refund|fulfill|reconcile/i })).not.toBeInTheDocument();
});

test('pending detail is read-only and does not trigger payment reconciliation or cart updates', async () => {
  fetch.mockResolvedValue(response({ ...receipt, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' }));
  render(<MerchantOrderDetail orderId={id} />);
  expect(await screen.findByText('Pending')).toBeVisible();
  expect(screen.getByText('Kept while this payment is unresolved.')).toBeVisible();
  expect(screen.getByText(/Payment has not been confirmed/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Paid')).not.toBeInTheDocument();
});

test.each([
  [401, 'Sign in to continue'], [403, 'Merchant access required'], [404, 'Order not found'], [503, 'Order details unavailable'],
])('detail handles HTTP %s without rendering private order data', async (status, title) => {
  fetch.mockResolvedValue(response(receipt, status));
  render(<MerchantOrderDetail orderId={id} />);
  expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  expect(screen.queryByText(receipt.reference)).not.toBeInTheDocument();
});

test.each([
  { ...receipt, id: secondId }, { ...receipt, shippingCents: 0 }, { ...receipt, paymentMode: 'live' },
])('detail rejects unverified identity or pricing rather than displaying a paid state (%j)', async (value) => {
  fetch.mockResolvedValue(response(value));
  render(<MerchantOrderDetail orderId={id} />);
  expect(await screen.findByRole('heading', { name: 'Order details unavailable' })).toBeVisible();
  expect(screen.queryByText('Paid')).not.toBeInTheDocument();
});

test('detail retry loads a recovered record and unmount cancels its request', async () => {
  fetch.mockResolvedValueOnce(response(null, 503)).mockResolvedValue(response(receipt));
  const view = render(<MerchantOrderDetail orderId={id} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await screen.findByText(receipt.reference);
  const signal = fetch.mock.calls.at(-1)[1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});

test('changing the detail route discards an in-flight previous order response', async () => {
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(response({ ...receipt, id: secondId, reference: 'TEST-87654321' }));
  const view = render(<MerchantOrderDetail orderId={id} />);
  view.rerender(<MerchantOrderDetail orderId={secondId} />);
  expect(await screen.findByText('TEST-87654321')).toBeVisible();
  await act(async () => resolveOld(response(receipt)));
  await waitFor(() => expect(screen.queryByText(receipt.reference)).not.toBeInTheDocument());
});
