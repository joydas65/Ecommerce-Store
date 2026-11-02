import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MerchantOrderDetail from './MerchantOrderDetail';

const id = 'order_12345678-1234-4123-8123-123456789012';
const otherId = 'order_87654321-1234-4123-8123-123456789012';
const requestId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const storageKey = `joys-merchant-payment-check-v1:${id}`;
const pendingOrder = {
  id, reference: 'TEST-12345678', quoteId: 'quote_12345678-1234-4123-8123-123456789012',
  status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paymentProvider: 'stripe-test', paymentMode: 'test',
  createdAt: '2026-11-01T12:00:00Z', expiresAt: '2026-12-01T12:00:00Z', currency: 'USD', pricingVersion: 'demo-v1',
  items: [{ productId: 'demo-notebook', name: 'Notebook', quantity: 1, unitPriceCents: 1200, lineTotalCents: 1200 }],
  shippingMethod: 'demo-standard', shippingCents: 500, subtotalCents: 1200, taxCents: 136, totalCents: 1836,
};
const paidOrder = { ...pendingOrder, status: 'CONFIRMED', paymentStatus: 'PAID' };
const reviewOrder = { ...pendingOrder, status: 'PAYMENT_REVIEW', paymentStatus: 'REQUIRES_REVIEW' };
const canceledOrder = { ...pendingOrder, status: 'CANCELED', paymentStatus: 'CANCELED' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const history = (reason = 'ready', events = [], retryAt = null) => ({ eligibility: { eligible: reason === 'ready', reason, retryAt }, events, hasMore: false });
const auditEvent = (request, outcome = 'pending', result = 'PENDING', previous = 'PENDING') => ({
  id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', requestId: request,
  actor: { id: 'merchant-user-1', displayName: 'Joy' }, occurredAt: '2026-11-02T12:00:00Z',
  outcome, previousPaymentStatus: previous, resultPaymentStatus: result,
});
const originalFetch = globalThis.fetch;

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
afterAll(() => { globalThis.fetch = originalFetch; });

function mockApi(options = {}) {
  const model = { order: pendingOrder, history: history(), ...options };
  const posts = [];
  globalThis.fetch = jest.fn(async (url, request) => {
    if (request.method === 'POST') {
      const body = JSON.parse(request.body);
      posts.push(body);
      if (model.post) return model.post(body, request);
      const event = auditEvent(body.requestId);
      model.history = history('ready', [event]);
      return response({ order: model.order, check: event, replayed: false });
    }
    if (url.endsWith('/payment-checks')) return typeof model.history === 'function' ? model.history(url, request) : response(model.history);
    return typeof model.order === 'function' ? model.order(url, request) : response(model.order);
  });
  return { model, posts };
}

async function openDetail(options) {
  const api = mockApi(options);
  const view = render(<MerchantOrderDetail orderId={id} />);
  await screen.findByRole('region', { name: 'Payment check history' });
  await waitFor(() => expect(screen.queryByText('Loading payment check history…')).not.toBeInTheDocument());
  return { ...api, ...view };
}

function saveRequest() {
  window.sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, orderId: id, requestId }));
}

test('loads the saved order and payment history independently without automatically checking Stripe', async () => {
  const { posts } = await openDetail();
  expect(screen.getByRole('button', { name: 'Recheck payment status', exact: true })).toBeEnabled();
  expect(screen.getByText('No merchant payment checks yet.')).toBeVisible();
  expect(screen.getByText('Merchant access')).toBeVisible();
  expect(posts).toEqual([]);
  expect(fetch).toHaveBeenCalledWith(`/api/merchant/orders/${id}/payment-checks`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal) }));
});

test('saves recovery before POST, prevents duplicate clicks, and refreshes the paid order and audit history', async () => {
  let finish;
  const { model, posts } = await openDetail({ post: (body) => {
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)).requestId).toBe(body.requestId);
    return new Promise((resolve) => { finish = () => {
      const event = auditEvent(body.requestId, 'paid', 'PAID');
      model.order = paidOrder;
      model.history = history('resolved', [event]);
      resolve(response({ order: paidOrder, check: event, replayed: false }));
    }; });
  } });
  const button = screen.getByRole('button', { name: 'Recheck payment status', exact: true });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(screen.getByRole('button', { name: 'Checking Stripe…', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refresh order', exact: true })).toBeDisabled();
  expect(posts).toHaveLength(1);
  await act(async () => finish());
  expect(await screen.findByText('Stripe verified this test payment.')).toBeVisible();
  expect(screen.getByText('Paid', { selector: 'span' })).toBeVisible();
  const timeline = screen.getByRole('list', { name: 'Payment check history' });
  expect(within(timeline).getByText('Payment verified')).toBeVisible();
  expect(within(timeline).getByText('By Joy')).toBeVisible();
  expect(within(timeline).getByText('Nov 2, 2026, 12:00 PM UTC')).toBeVisible();
  expect(within(timeline).getByLabelText('changed to')).toBeVisible();
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  expect(fetch.mock.calls.filter(([url]) => url === `/api/merchant/orders/${id}`)).toHaveLength(2);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/payment-checks'))).toHaveLength(2);
});

test.each([
  ['pending', pendingOrder, 'Stripe has not confirmed payment. The latest saved status is shown above.', 'Payment still pending'],
  ['review_required', reviewOrder, 'The payment result needs review. Stripe did not provide a verified payment confirmation.', 'Payment needs review'],
  ['provider_unavailable', pendingOrder, 'Stripe could not be reached by this check. The latest saved payment status is shown above.', 'Stripe unavailable'],
  ['canceled', canceledOrder, 'Stripe verified that this checkout is canceled.', 'Cancellation verified'],
])('shows the durable %s outcome without misrepresenting it as payment success', async (outcome, order, message, auditLabel) => {
  const { model, posts } = await openDetail({ post: async (body) => {
    const event = auditEvent(body.requestId, outcome, order.paymentStatus);
    model.order = order;
    model.history = history(outcome === 'canceled' ? 'resolved' : 'ready', [event]);
    return response({ order, check: event, replayed: false });
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  expect(await screen.findByText(message)).toBeVisible();
  expect(await screen.findByRole('list', { name: 'Payment check history' })).toContainElement(screen.getByText(auditLabel, { exact: true }));
  expect(posts).toHaveLength(1);
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  expect(screen.queryByText('Stripe verified this test payment.')).not.toBeInTheDocument();
});

test('recovers the same request after an ambiguous response and full component reload', async () => {
  const { model, posts, unmount } = await openDetail({ post: async () => { throw new Error('Response lost'); } });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  expect(await screen.findByText(/The result could not be confirmed/)).toBeVisible();
  const savedId = posts[0].requestId;
  expect(JSON.parse(window.sessionStorage.getItem(storageKey)).requestId).toBe(savedId);
  unmount();
  model.post = async (body) => {
    const event = auditEvent(body.requestId, 'paid', 'PAID');
    model.order = paidOrder;
    model.history = history('resolved', [event]);
    return response({ order: paidOrder, check: event, replayed: true });
  };
  render(<MerchantOrderDetail orderId={id} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Recover previous check', exact: true }));
  expect(await screen.findByText(/Recovered saved result. Earlier check: Payment verified/)).toBeVisible();
  expect(posts[1].requestId).toBe(savedId);
  expect(window.sessionStorage.getItem(storageKey)).toBeNull();
});

test('a historical pending replay is described as earlier activity when the current order is already paid', async () => {
  saveRequest();
  const event = auditEvent(requestId, 'pending');
  await openDetail({ order: paidOrder, history: history('resolved', [event]), post: async () => response({ order: paidOrder, check: event, replayed: true }) });
  fireEvent.click(screen.getByRole('button', { name: 'Recover previous check', exact: true }));
  expect(await screen.findByText(/Earlier check: Payment still pending/)).toBeVisible();
  expect(screen.getByText('Paid', { selector: 'span' })).toBeVisible();
  expect(screen.queryByText('Stripe has not confirmed payment. The latest saved status is shown above.')).not.toBeInTheDocument();
});

test.each([401, 403])('HTTP %s during a check hides merchant data and preserves its recovery key', async (status) => {
  await openDetail({ post: async () => response(null, status) });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  expect(await screen.findByRole('heading', { name: status === 401 ? 'Sign in to continue' : 'Merchant access required' })).toBeVisible();
  expect(screen.queryByText(pendingOrder.reference)).not.toBeInTheDocument();
  expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
});

test.each([401, 403])('an HTTP %s history response prevents a late order read from revealing merchant data', async (status) => {
  let finishOrder;
  mockApi({ order: () => new Promise((resolve) => { finishOrder = resolve; }), history: async () => response(null, status) });
  render(<MerchantOrderDetail orderId={id} />);
  await screen.findByRole('heading', { name: status === 401 ? 'Sign in to continue' : 'Merchant access required' });
  await act(async () => finishOrder(response(pendingOrder)));
  expect(screen.queryByText(pendingOrder.reference)).not.toBeInTheDocument();
});

test.each([
  [409, 'PAYMENT_CHECK_IN_PROGRESS'],
  [429, 'PAYMENT_CHECK_RATE_LIMITED'],
])('HTTP %s keeps the request identity, waits for retryAt, and never automatically posts', async (status, code) => {
  const { model, posts } = await openDetail();
  jest.useFakeTimers();
  const retryAt = new Date(Date.now() + 1000).toISOString();
  model.post = async () => response({ error: { code, retryAt } }, status);
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Recover previous check', exact: true })).toBeDisabled();
  const savedId = posts[0].requestId;
  await act(async () => { await jest.advanceTimersByTimeAsync(1200); });
  expect(screen.getByRole('button', { name: 'Recover previous check', exact: true })).toBeEnabled();
  expect(posts).toHaveLength(1);
  model.post = async (body) => response({ order: pendingOrder, check: auditEvent(body.requestId), replayed: true });
  fireEvent.click(screen.getByRole('button', { name: 'Recover previous check', exact: true }));
  await act(async () => {});
  expect(posts[1].requestId).toBe(savedId);
});

test('an already expired cooldown does not disable recovery forever', async () => {
  saveRequest();
  await openDetail({ history: history('cooldown', [], new Date(Date.now() - 1000).toISOString()) });
  expect(screen.getByRole('button', { name: 'Recover previous check', exact: true })).toBeEnabled();
});

test('an ineligible new request refreshes current data, clears its unaccepted key, and explains the reason', async () => {
  const { model } = await openDetail({ post: async () => {
    model.history = history('missing_session');
    return response({ error: { code: 'PAYMENT_CHECK_NOT_ELIGIBLE' } }, 409);
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  expect(await screen.findByText('This order has no saved Stripe checkout session to check.')).toBeVisible();
  await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toBeNull());
  expect(screen.queryByRole('button', { name: 'Recover previous check', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Recheck payment status', exact: true })).not.toBeInTheDocument();
});

test('a request conflict retains its identity and prevents a replacement check', async () => {
  saveRequest();
  await openDetail({ post: async () => response({ error: { code: 'IDEMPOTENCY_CONFLICT' } }, 409) });
  fireEvent.click(screen.getByRole('button', { name: 'Recover previous check', exact: true }));
  expect(await screen.findByText(/This recovery request belongs to a different check/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Recover previous check', exact: true })).toBeDisabled();
  expect(JSON.parse(window.sessionStorage.getItem(storageKey)).requestId).toBe(requestId);
});

test.each([
  ['missing_session', pendingOrder, 'This order has no saved Stripe checkout session to check.'],
  ['resolved', paidOrder, 'This payment is already resolved. Its saved result is shown above.'],
  ['payments_disabled', pendingOrder, 'Stripe payment checks are currently unavailable in this environment.'],
  ['not_stripe', { ...pendingOrder, reference: 'DEMO-12345678', status: 'CONFIRMED', paymentStatus: 'SIMULATED', paymentProvider: 'simulated', paymentMode: undefined }, 'Simulated orders do not have a Stripe payment to check.'],
])('does not offer a new action for %s', async (reason, order, explanation) => {
  const { posts } = await openDetail({ order, history: history(reason) });
  expect(screen.getByText(explanation)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Recheck payment status', exact: true })).not.toBeInTheDocument();
  expect(posts).toEqual([]);
});

test('a storage failure prevents the request from being sent without recoverability', async () => {
  const { posts } = await openDetail();
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  expect(await screen.findByText(/No request was sent/)).toBeVisible();
  expect(posts).toEqual([]);
});

test('malformed saved recovery is not silently replaced by a fresh check', async () => {
  window.sessionStorage.setItem(storageKey, '{broken');
  const { posts } = await openDetail();
  expect(screen.getByRole('button', { name: 'Recheck payment status', exact: true })).toBeDisabled();
  expect(screen.getByText(/Browser recovery storage is unavailable or invalid/)).toBeVisible();
  expect(posts).toEqual([]);
});

test.each([
  { eligibility: { eligible: true, reason: 'resolved', retryAt: null }, events: [], hasMore: false },
  { ...history(), hasMore: 'yes' },
  history('ready', [{ ...auditEvent(requestId, 'paid', 'PENDING') }]),
])('invalid audit data fails closed and does not enable a check (%j)', async (value) => {
  const { posts } = await openDetail({ history: value });
  expect(screen.getByText(/Payment check history is unavailable/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Recheck payment status', exact: true })).not.toBeInTheDocument();
  expect(posts).toEqual([]);
});

test.each(['wrong-order', 'wrong-request', 'invalid-state'])('an invalid %s result preserves recovery and does not falsely confirm payment', async (fault) => {
  await openDetail({ post: async (body) => response({
    order: fault === 'wrong-order' ? { ...paidOrder, id: otherId } : paidOrder,
    check: auditEvent(fault === 'wrong-request' ? requestId : body.requestId, 'paid', fault === 'invalid-state' ? 'PENDING' : 'PAID'), replayed: false,
  }) });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  expect(await screen.findByText(/The result could not be confirmed/)).toBeVisible();
  expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
  expect(screen.queryByText('Stripe verified this test payment.')).not.toBeInTheDocument();
});

test('a route change during response-body parsing aborts and ignores the previous action', async () => {
  let resolveBody;
  let oldSignal;
  let postedId;
  const { model, rerender } = await openDetail({ post: async (body, options) => {
    postedId = body.requestId;
    oldSignal = options.signal;
    return { ok: true, status: 200, json: () => new Promise((resolve) => { resolveBody = resolve; }) };
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Recheck payment status', exact: true }));
  await act(async () => {});
  model.order = { ...pendingOrder, id: otherId, reference: 'TEST-87654321' };
  rerender(<MerchantOrderDetail orderId={otherId} />);
  await screen.findByText('TEST-87654321');
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveBody({ order: paidOrder, check: auditEvent(postedId, 'paid', 'PAID'), replayed: false }));
  expect(screen.queryByText(pendingOrder.reference)).not.toBeInTheDocument();
  expect(screen.queryByText('Stripe verified this test payment.')).not.toBeInTheDocument();
  expect(JSON.parse(window.sessionStorage.getItem(storageKey)).requestId).toBe(postedId);
});

test('renders requested, interrupted, and truncated audit entries with truthful saved-state labels', async () => {
  const requested = { ...auditEvent(requestId, 'requested'), id: 'cccccccc-3333-4333-8333-cccccccccccc' };
  const interrupted = auditEvent(requestId, 'interrupted');
  await openDetail({ history: { ...history('ready', [interrupted, requested]), hasMore: true } });
  const list = screen.getByRole('list', { name: 'Payment check history' });
  expect(within(list).getByText('Check requested')).toBeVisible();
  expect(within(list).getByText('Check interrupted')).toBeVisible();
  expect(within(list).getAllByText('Saved status: Pending (unchanged)')).toHaveLength(2);
  expect(screen.getByText(/Showing the latest 20 activity entries/)).toBeVisible();
});
