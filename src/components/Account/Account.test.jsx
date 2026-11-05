import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerSignIn from './CustomerSignIn';
import CustomerOrders from './CustomerOrders';
import CustomerOrderDetail from './CustomerOrderDetail';
import AccountWorkspace from './AccountWorkspace';
import Navbar from '../Navbar/Navbar';

const push = jest.fn((href) => window.history.pushState(null, '', href));
const replace = jest.fn();
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push, replace, refresh }) }));

const id = 'order_12345678-1234-4123-8123-123456789012';
const otherId = 'order_87654321-1234-4123-8123-123456789012';
const receipt = {
  id, reference: 'TEST-12345678', quoteId: 'quote_12345678-1234-4123-8123-123456789012',
  status: 'CONFIRMED', paymentStatus: 'PAID', paymentProvider: 'stripe-test', paymentMode: 'test',
  createdAt: '2026-11-01T12:00:00Z', expiresAt: '2026-12-01T12:00:00Z', currency: 'USD', pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 2, unitPriceCents: 1200, lineTotalCents: 2400 }],
  shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 2400, taxCents: 232, totalCents: 3132,
};
const summary = { id, reference: receipt.reference, status: receipt.status, paymentStatus: receipt.paymentStatus,
  paymentProvider: receipt.paymentProvider, paymentMode: receipt.paymentMode, createdAt: receipt.createdAt, currency: 'USD', totalCents: receipt.totalCents, itemCount: 2 };
const page = (orders = [summary], nextCursor = null) => ({ orders, pageInfo: { nextCursor, hasMore: nextCursor !== null } });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(); window.history.replaceState(null, '', '/account'); });
afterAll(() => { global.fetch = originalFetch; });

test('customer account navigation is explicitly enabled, while the cart remains available', () => {
  const view = render(<Navbar totalItems={2} />);
  expect(screen.queryByRole('link', { name: 'Your account' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cart 2 items' })).toHaveAttribute('href', '/cart');
  view.rerender(<Navbar totalItems={2} customerAccountsEnabled />);
  expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/account');
});

test('disabled account environments preserve guest checkout without a broken Google button', () => {
  render(<CustomerSignIn available={false} />);
  expect(screen.getByRole('alert')).toHaveTextContent('continue shopping as a guest');
  expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/');
});

test.each([true, false])('privacy information is available before sign-in when accounts are enabled: %s', (available) => {
  render(<CustomerSignIn available={available} />);
  expect(screen.getByRole('link', { name: 'privacy information' })).toHaveAttribute('href', '/privacy');
  expect(fetch).not.toHaveBeenCalled();
});

test('Google sign-in uses a fixed customer-only callback and safe retry messaging', async () => {
  fetch.mockResolvedValue(response({ providerError: 'private-token' }, 503));
  render(<CustomerSignIn available failed />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  expect(await screen.findByText('Sign-in is temporarily unavailable. Please try again.')).toBeVisible();
  expect(fetch).toHaveBeenCalledWith('/api/customer-auth/sign-in/social', expect.objectContaining({ method: 'POST', body: JSON.stringify({ provider: 'google', callbackURL: '/account', errorCallbackURL: '/account/sign-in' }), credentials: 'same-origin', cache: 'no-store' }));
  expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  expect(screen.queryByText(/private-token/)).not.toBeInTheDocument();
});

test('sign-in suppresses repeated clicks and aborts abandoned requests', async () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const view = render(<CustomerSignIn available />);
  const button = screen.getByRole('button', { name: 'Sign in with Google' });
  fireEvent.click(button); fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
  const signal = fetch.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});

test('rate limits explain a delay without displaying provider error details', async () => {
  fetch.mockResolvedValue(response({}, 429));
  render(<CustomerSignIn available />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('wait a moment');
});

test.each(['https://attacker.example', 'https://accounts.google.com/other', 'https://user:pass@accounts.google.com/o/oauth2/v2/auth'])('customer sign-in refuses an unexpected redirect: %s', async (url) => {
  fetch.mockResolvedValue(response({ url }));
  render(<CustomerSignIn available />);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
});

test('sign-out waits for revocation, then hides account data before navigation completes', async () => {
  let resolve;
  fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<AccountWorkspace title="My account" description="Private"><p>Private order information</p></AccountWorkspace>);
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByText('Private order information')).toBeVisible();
  await act(async () => resolve(response({ success: true })));
  expect(screen.queryByText('Private order information')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/account/sign-in');
  expect(refresh).toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith('/api/customer-auth/sign-out', expect.objectContaining({ method: 'POST', body: '{}', credentials: 'same-origin', cache: 'no-store' }));
});

test('failed sign-out leaves the account visible and allows retry', async () => {
  fetch.mockResolvedValue(response({}, 503));
  render(<AccountWorkspace title="My account" description="Private"><p>Private order information</p></AccountWorkspace>);
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out');
  expect(screen.getByText('Private order information')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  expect(replace).not.toHaveBeenCalled();
});

test('an abandoned sign-out response cannot navigate a different page', async () => {
  let resolve;
  fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<AccountWorkspace title="My account" description="Private"><p>Private order information</p></AccountWorkspace>);
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  const signal = fetch.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response({ success: true })));
  expect(replace).not.toHaveBeenCalled();
});

test('loads private order summaries with clear test payment states and receipt links', async () => {
  fetch.mockResolvedValue(response(page()));
  render(<CustomerOrders />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your orders');
  const orders = await screen.findByRole('list', { name: 'Your orders' });
  expect(within(orders).getByText('Paid · test payment')).toBeVisible();
  expect(within(orders).getByText('$31.32')).toBeVisible();
  expect(within(orders).getByRole('link', { name: 'View receipt TEST-12345678' })).toHaveAttribute('href', `/account/orders/${id}`);
  expect(screen.getByRole('button', { name: 'Older orders' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledWith('/api/customer/orders?limit=20', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', signal: expect.any(AbortSignal) }));
});

test('empty account history explains that older guest orders are not imported', async () => {
  fetch.mockResolvedValue(response(page([])));
  render(<CustomerOrders />);
  expect(await screen.findByText('Your next purchase starts here')).toBeVisible();
  expect(screen.getByText(/Earlier guest purchases remain/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Explore the collection' })).toHaveAttribute('href', '/');
});

test('pagination follows returned cursors and supports opening shared page URLs', async () => {
  fetch.mockResolvedValueOnce(response(page([summary], 'opaque-cursor'))).mockResolvedValue(response(page([{ ...summary, id: otherId, reference: 'TEST-87654321' }])));
  const view = render(<CustomerOrders />);
  await screen.findByRole('list', { name: 'Your orders' });
  await userEvent.click(screen.getByRole('button', { name: 'Older orders' }));
  expect(push).toHaveBeenCalledWith('/account?cursor=opaque-cursor');
  view.rerender(<CustomerOrders />);
  expect(await screen.findByRole('link', { name: 'TEST-87654321' })).toBeVisible();
  expect(fetch).toHaveBeenLastCalledWith('/api/customer/orders?limit=20&cursor=opaque-cursor', expect.any(Object));
  await userEvent.click(screen.getByRole('button', { name: 'Newer orders' }));
  expect(push).toHaveBeenLastCalledWith('/account');
});

test.each(['/account?cursor=one&cursor=two', '/account?userId=someone', '/account?cursor=%3Cscript%3E'])('invalid order URLs fail closed before requesting data: %s', (url) => {
  window.history.replaceState(null, '', url);
  render(<CustomerOrders />);
  expect(screen.getByText('This order page is unavailable')).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([401, 403])('expired or denied account sessions clear summaries and prompt sign-in: %s', async (status) => {
  fetch.mockResolvedValueOnce(response(page())).mockResolvedValueOnce(response({}, status));
  render(<CustomerOrders />);
  await screen.findByRole('list', { name: 'Your orders' });
  await userEvent.click(screen.getByRole('button', { name: 'Refresh orders' }));
  expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', '/account/sign-in');
  expect(screen.queryByText(summary.reference)).not.toBeInTheDocument();
});

test.each([page([{ ...summary, paymentStatus: 'PAID', status: 'PENDING_PAYMENT' }]), page([summary, summary]), { orders: [], pageInfo: { nextCursor: 'forged', hasMore: false } }])('malformed account data does not appear as a confirmed order', async (data) => {
  fetch.mockResolvedValue(response(data));
  render(<CustomerOrders />);
  expect(await screen.findByText('Your account is temporarily unavailable')).toBeVisible();
  expect(screen.queryByText(summary.reference)).not.toBeInTheDocument();
});

test('a delayed old response cannot replace the current account page', async () => {
  let finishOldBody;
  fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise((done) => { finishOldBody = done; }) })
    .mockResolvedValueOnce(response(page([{ ...summary, id: otherId, reference: 'TEST-87654321' }])));
  const view = render(<CustomerOrders />);
  await waitFor(() => expect(finishOldBody).toEqual(expect.any(Function)));
  await act(async () => { window.history.replaceState(null, '', '/account?cursor=older'); view.rerender(<CustomerOrders />); });
  expect(await screen.findByRole('link', { name: 'TEST-87654321' })).toBeVisible();
  await act(async () => finishOldBody(page()));
  expect(screen.queryByText(summary.reference)).not.toBeInTheDocument();
});

test('receipt detail shows saved shipping/tax, ownership URL and readonly payment status', async () => {
  fetch.mockResolvedValue(response(receipt));
  render(<CustomerOrderDetail orderId={id} />);
  expect(await screen.findByText('Notebook')).toBeVisible();
  expect(screen.getByText('Standard shipping')).toBeVisible();
  expect(screen.getByText('$5.00')).toBeVisible();
  expect(screen.getByText('$2.32')).toBeVisible();
  expect(screen.getByText('Paid · test payment')).toBeVisible();
  expect(screen.queryByRole('button', { name: /recheck|cancel/i })).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(`/api/customer/orders/${id}`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }));
});

test('another account’s unavailable receipt has no leaked order fields', async () => {
  fetch.mockResolvedValue(response({ ...receipt, message: 'private' }, 404));
  render(<CustomerOrderDetail orderId={id} />);
  expect(await screen.findByText('Order not found')).toBeVisible();
  expect(screen.queryByText('Notebook')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to my orders' })).toHaveAttribute('href', '/account');
});

test('a receipt for a different order ID is rejected', async () => {
  fetch.mockResolvedValue(response({ ...receipt, id: otherId }));
  render(<CustomerOrderDetail orderId={id} />);
  expect(await screen.findByText('Your account is temporarily unavailable')).toBeVisible();
  expect(screen.queryByText('Notebook')).not.toBeInTheDocument();
});

test('pending receipt stays unconfirmed and refresh can display the verified saved result', async () => {
  fetch.mockResolvedValueOnce(response({ ...receipt, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' })).mockResolvedValueOnce(response(receipt));
  render(<CustomerOrderDetail orderId={id} />);
  expect(await screen.findByText('Payment pending')).toBeVisible();
  expect(screen.queryByText('Paid · test payment')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh receipt' }));
  expect(await screen.findByText('Paid · test payment')).toBeVisible();
});
