import { isSimulatedOrderReceipt, isStripeOrder } from '../../lib/orders/order-contract';

const states = {
  PAID: { label: 'Paid · test payment', tone: 'paid', description: 'Stripe confirmed this test payment. No real money was charged.' },
  PENDING: { label: 'Payment pending', tone: 'pending', description: 'Payment has not been confirmed. Refresh to see the latest saved result.' },
  REQUIRES_REVIEW: { label: 'Payment needs review', tone: 'review', description: 'This payment could not be verified. The store needs to review it before it can be confirmed.' },
  CANCELED: { label: 'Checkout canceled', tone: 'canceled', description: 'This test checkout was canceled. No paid confirmation is recorded.' },
  SIMULATED: { label: 'Simulated purchase', tone: 'simulated', description: 'This purchase used simulation. No money was collected.' },
};
const pairs = { PAID: 'CONFIRMED', PENDING: 'PENDING_PAYMENT', REQUIRES_REVIEW: 'PAYMENT_REVIEW', CANCELED: 'CANCELED', SIMULATED: 'CONFIRMED' };
export const customerOrderId = /^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const orderDate = (value) => `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`;
export const paymentLabel = (order) => states[order.paymentStatus];
export const isCustomerReceipt = (value, id) => isSimulatedOrderReceipt(value, id) || isStripeOrder(value, id);

export function isCustomerOrderPage(value) {
  return !!value && Array.isArray(value.orders) && value.orders.length <= 50 && value.orders.every((order) => order
    && customerOrderId.test(order.id) && typeof order.reference === 'string' && /^(?:TEST|DEMO)-[\da-z-]+$/i.test(order.reference)
    && typeof order.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(order.createdAt) && Number.isFinite(Date.parse(order.createdAt))
    && Object.hasOwn(pairs, order.paymentStatus) && order.status === pairs[order.paymentStatus]
    && (order.paymentStatus === 'SIMULATED' ? order.paymentProvider === 'simulated' && order.paymentMode === undefined
      : order.paymentProvider === 'stripe-test' && order.paymentMode === 'test')
    && order.currency === 'USD' && Number.isSafeInteger(order.totalCents) && order.totalCents >= 0
    && Number.isSafeInteger(order.itemCount) && order.itemCount > 0)
    && new Set(value.orders.map((order) => order.id)).size === value.orders.length
    && typeof value.pageInfo?.hasMore === 'boolean'
    && (value.pageInfo.hasMore ? value.orders.length > 0 && typeof value.pageInfo.nextCursor === 'string'
      && /^[A-Za-z0-9_-]{1,512}$/.test(value.pageInfo.nextCursor) : value.pageInfo.nextCursor === null);
}

export const ordersHref = (cursor = '') => `/account${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`;
