export const MERCHANT_STATUS_OPTIONS = [
  { value: 'all', label: 'All payments' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'review', label: 'Needs review' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'simulated', label: 'Simulated' },
];

const states = {
  PAID: { label: 'Paid', tone: 'paid', detail: 'Stripe verified this test payment. This order is ready for merchant review.' },
  PENDING: { label: 'Pending', tone: 'pending', detail: 'Payment has not been confirmed. This order is awaiting a verified payment result.' },
  REQUIRES_REVIEW: { label: 'Needs review', tone: 'review', detail: 'The payment result could not be verified and needs review. This is not a confirmed payment.' },
  CANCELED: { label: 'Canceled', tone: 'canceled', detail: 'The Stripe test checkout was canceled. No paid confirmation is recorded.' },
  SIMULATED: { label: 'Simulated', tone: 'simulated', detail: 'This order was completed using simulation. No payment provider collected money.' },
};
const idPattern = /^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const statusPairs = { PAID: 'CONFIRMED', PENDING: 'PENDING_PAYMENT', REQUIRES_REVIEW: 'PAYMENT_REVIEW', CANCELED: 'CANCELED', SIMULATED: 'CONFIRMED' };

export function paymentLabel(order) { return states[order.paymentStatus]; }
export function providerLabel(order) { return order.paymentProvider === 'stripe-test' ? 'Stripe test' : 'Simulation'; }
export const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const orderDate = (value) => `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;

export function readMerchantQuery(params) {
  const status = params.get('status') || 'all';
  const cursor = params.get('cursor') || '';
  const valid = MERCHANT_STATUS_OPTIONS.some((option) => option.value === status)
    && params.getAll('status').length <= 1 && params.getAll('cursor').length <= 1
    && cursor.length <= 2048 && (!cursor || /^[A-Za-z0-9_.-]+$/.test(cursor));
  return { status, cursor, valid };
}

export function merchantOrdersHref(status = 'all', cursor = '') {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  return `/admin/orders${params.size ? `?${params}` : ''}`;
}

export function isMerchantSummary(order) {
  return !!order && idPattern.test(order.id) && typeof order.reference === 'string'
    && /^(?:TEST|DEMO)-[\da-z-]+$/i.test(order.reference)
    && typeof order.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(order.createdAt) && Number.isFinite(Date.parse(order.createdAt))
    && Object.hasOwn(statusPairs, order.paymentStatus) && order.status === statusPairs[order.paymentStatus]
    && (order.paymentStatus === 'SIMULATED'
      ? order.paymentProvider === 'simulated' && order.paymentMode === undefined
      : order.paymentProvider === 'stripe-test' && order.paymentMode === 'test')
    && order.currency === 'USD' && Number.isSafeInteger(order.totalCents) && order.totalCents >= 0
    && Number.isSafeInteger(order.itemCount) && order.itemCount > 0;
}

export function isMerchantOrderPage(value) {
  return !!value && Array.isArray(value.orders) && value.orders.length <= 50
    && value.orders.every(isMerchantSummary) && new Set(value.orders.map((order) => order.id)).size === value.orders.length
    && typeof value.pageInfo?.hasMore === 'boolean'
    && (value.pageInfo.hasMore
      ? value.orders.length > 0 && typeof value.pageInfo.nextCursor === 'string' && /^[A-Za-z0-9_.-]{1,2048}$/.test(value.pageInfo.nextCursor)
      : value.pageInfo.nextCursor === null);
}
