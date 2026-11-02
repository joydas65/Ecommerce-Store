import { isStripeOrder } from '../../lib/orders/order-contract';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const reasons = ['ready', 'not_stripe', 'resolved', 'missing_session', 'in_progress', 'cooldown', 'payments_disabled'];
const outcomes = ['requested', 'paid', 'pending', 'canceled', 'review_required', 'provider_unavailable', 'already_resolved', 'interrupted'];
const paymentStates = ['PENDING', 'PAID', 'CANCELED', 'REQUIRES_REVIEW'];
const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function isPaymentCheckEvent(event) {
  return !!event && uuid.test(event.id) && uuid.test(event.requestId) && isoDate(event.occurredAt)
    && typeof event.actor?.id === 'string' && /^[\x21-\x7e]{1,128}$/.test(event.actor.id)
    && typeof event.actor.displayName === 'string' && event.actor.displayName.trim().length > 0 && event.actor.displayName.length <= 80
    && outcomes.includes(event.outcome) && paymentStates.includes(event.previousPaymentStatus) && paymentStates.includes(event.resultPaymentStatus)
    && (event.outcome !== 'paid' || event.resultPaymentStatus === 'PAID')
    && (event.outcome !== 'canceled' || event.resultPaymentStatus === 'CANCELED')
    && (event.outcome !== 'requested' || event.previousPaymentStatus === event.resultPaymentStatus);
}

export function isPaymentCheckHistory(value) {
  return !!value && typeof value.hasMore === 'boolean' && Array.isArray(value.events) && value.events.length <= 20
    && value.events.every(isPaymentCheckEvent) && new Set(value.events.map((event) => event.id)).size === value.events.length
    && typeof value.eligibility?.eligible === 'boolean' && reasons.includes(value.eligibility.reason)
    && value.eligibility.eligible === (value.eligibility.reason === 'ready')
    && (value.eligibility.retryAt === null || isoDate(value.eligibility.retryAt));
}

export function isPaymentCheckResult(value, orderId, requestId) {
  return !!value && typeof value.replayed === 'boolean' && isStripeOrder(value.order, orderId)
    && isPaymentCheckEvent(value.check) && value.check.requestId === requestId && value.check.outcome !== 'requested'
    && (value.replayed || value.check.resultPaymentStatus === value.order.paymentStatus);
}

export function paymentCheckFailure(value, status) {
  const error = value?.error;
  const allowed = status === 409 ? ['PAYMENT_CHECK_IN_PROGRESS', 'PAYMENT_CHECK_NOT_ELIGIBLE', 'IDEMPOTENCY_CONFLICT']
    : status === 429 ? ['PAYMENT_CHECK_RATE_LIMITED'] : [];
  if (!error || !allowed.includes(error.code) || (error.retryAt !== undefined && !isoDate(error.retryAt))) return null;
  return { code: error.code, retryAt: error.retryAt || null };
}

const key = (orderId) => `joys-merchant-payment-check-v1:${orderId}`;
export function savedPaymentCheck(orderId) {
  const raw = window.sessionStorage.getItem(key(orderId));
  if (raw === null) return null;
  if (raw.length > 256) throw new Error('Saved check is invalid.');
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || value.orderId !== orderId || !uuid.test(value.requestId)
    || Object.keys(value).sort().join(',') !== 'orderId,requestId,version') throw new Error('Saved check is invalid.');
  return value.requestId;
}

export function reservePaymentCheck(orderId) {
  const pending = savedPaymentCheck(orderId);
  if (pending) return pending;
  const requestId = globalThis.crypto.randomUUID();
  window.sessionStorage.setItem(key(orderId), JSON.stringify({ version: 1, orderId, requestId }));
  if (savedPaymentCheck(orderId) !== requestId) throw new Error('Check recovery could not be saved.');
  return requestId;
}

export function clearPaymentCheck(orderId, requestId) {
  if (savedPaymentCheck(orderId) === requestId) window.sessionStorage.removeItem(key(orderId));
  if (savedPaymentCheck(orderId) === requestId) throw new Error('Check recovery could not be cleared.');
}

export const checkOutcomeLabels = {
  requested: 'Check requested', paid: 'Payment verified', pending: 'Payment still pending', canceled: 'Cancellation verified',
  review_required: 'Payment needs review', provider_unavailable: 'Stripe unavailable', already_resolved: 'Already resolved', interrupted: 'Check interrupted',
};
export const checkStateLabels = { PAID: 'Paid', PENDING: 'Pending', CANCELED: 'Canceled', REQUIRES_REVIEW: 'Needs review' };
export const checkFeedback = {
  paid: { severity: 'success', message: 'Stripe verified this test payment.' },
  pending: { severity: 'info', message: 'Stripe has not confirmed payment. The latest saved status is shown above.' },
  canceled: { severity: 'info', message: 'Stripe verified that this checkout is canceled.' },
  review_required: { severity: 'warning', message: 'The payment result needs review. Stripe did not provide a verified payment confirmation.' },
  provider_unavailable: { severity: 'warning', message: 'Stripe could not be reached by this check. The latest saved payment status is shown above.' },
  already_resolved: { severity: 'info', message: 'The order was already resolved. Its latest saved payment status is shown above.' },
  interrupted: { severity: 'warning', message: 'The previous check was interrupted. Review the saved payment status before starting another check.' },
};
