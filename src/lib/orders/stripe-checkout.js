import { createDemoCommerce } from '../demo/commerce';
import { PENDING_ORDER_KEY, toCheckoutLive } from './persistent-demo';
import { isPaidStripeOrder, isQuote, isStripeOrder, isStripeSessionResult } from './order-contract';

export const STRIPE_PENDING_KEY = 'joys-store-stripe-checkout-v1';
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const entityId = (value, prefix) => typeof value === 'string' && value.startsWith(`${prefix}_`) && uuid.test(value.slice(prefix.length + 1));

export function createStripeCheckoutCommerce({ storage, fetchImpl = globalThis.fetch, delayMs = 200,
  lockManager = globalThis.navigator?.locks } = {}) {
  const local = createDemoCommerce({ storage, delayMs });
  const recoveryStorage = storage || {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
  const checkouts = new Map();

  async function withLock(operation) {
    if (typeof lockManager?.request !== 'function') throw new Error('This browser cannot safely coordinate checkout. Use an up-to-date browser over HTTPS and try again.');
    return lockManager.request(PENDING_ORDER_KEY, { mode: 'exclusive' }, operation);
  }

  function readPending() {
    let raw;
    try { raw = recoveryStorage.getItem(STRIPE_PENDING_KEY); }
    catch { throw new Error('Browser storage is needed to recover a Stripe checkout safely. Enable it before continuing.'); }
    if (!raw) return null;
    try {
      const attempt = JSON.parse(raw);
      if (attempt.version !== 1 || attempt.paymentProvider !== 'stripe-test' || !uuid.test(attempt.key)
        || !entityId(attempt.quoteId, 'quote') || typeof attempt.cart?.id !== 'string'
        || !Number.isSafeInteger(attempt.cart.revision) || attempt.cart.revision < 0
        || (attempt.orderId !== undefined && !entityId(attempt.orderId, 'order'))) throw new Error();
      return attempt;
    } catch { throw new Error('Your saved Stripe checkout could not be read. Do not start another payment until the existing attempt is recovered.'); }
  }

  function savePending(attempt) {
    try {
      const raw = JSON.stringify(attempt);
      recoveryStorage.setItem(STRIPE_PENDING_KEY, raw);
      if (recoveryStorage.getItem(STRIPE_PENDING_KEY) !== raw) throw new Error();
    } catch { throw new Error('Checkout recovery details could not be saved. No new Stripe checkout was submitted. Enable browser storage and retry.'); }
  }

  const sameAttempt = (left, right) => left && right && left.key === right.key && left.quoteId === right.quoteId
    && left.cart.id === right.cart.id && left.cart.revision === right.cart.revision;

  function clearPending(attempt) {
    try { if (sameAttempt(readPending(), attempt)) recoveryStorage.removeItem(STRIPE_PENDING_KEY); }
    catch { /* Retaining the same attempt is safe; recovery will retry cleanup. */ }
  }

  async function request(path, body, headers = {}) {
    let response;
    try {
      response = await fetchImpl(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    } catch { throw new Error('The Stripe checkout response could not be confirmed. Resume the saved checkout instead of starting another payment.'); }
    let result;
    try { result = await response.json(); }
    catch { throw new Error('The checkout response could not be read. Resume the saved checkout to check its status.'); }
    if (!response.ok) {
      const error = new Error(result.error?.message || 'Stripe checkout is temporarily unavailable. Please try again.');
      error.code = result.error?.code;
      throw error;
    }
    return result;
  }

  async function submitSession(attempt) {
    let result;
    try { result = await request('/api/payment-sessions', { quoteId: attempt.quoteId }, { 'Idempotency-Key': attempt.key }); }
    catch (error) {
      if (error.code === 'QUOTE_EXPIRED') clearPending(attempt);
      throw error;
    }
    if (!isStripeSessionResult(result) || result.order.quoteId !== attempt.quoteId
      || (attempt.orderId && result.order.id !== attempt.orderId)) {
      throw new Error('The service did not return a valid Stripe checkout. Resume the saved attempt to check its status.');
    }
    if (result.order.status === 'CANCELED') clearPending(attempt);
    else if (sameAttempt(readPending(), attempt)) {
      // The original quote/key record is sufficient for replay if this optional
      // order-ID update fails. Never create a fresh attempt after that failure.
      try { savePending({ ...attempt, orderId: result.order.id }); } catch { /* Keep the original durable attempt. */ }
    }
    return result;
  }

  function tokenFor(id) {
    const token = checkouts.get(id);
    if (!token) throw new Error('This checkout has expired. Return to the cart and review your order again.');
    return token;
  }

  return {
    ...local,
    checkout: {
      ...local.checkout,
      generateToken: async (...args) => {
        const token = await local.checkout.generateToken(...args);
        checkouts.set(token.id, { cart: local.demo.snapshot(), quote: null });
        return token;
      },
      checkShippingOption: async (id, options) => {
        const result = await local.checkout.checkShippingOption(id, options);
        const token = tokenFor(id);
        token.shippingMethod = options.shipping_option_id;
        token.quote = null;
        return result;
      },
      setTaxZone: async (id, location) => {
        await local.checkout.setTaxZone(id, location);
        const token = tokenFor(id);
        const quote = await request('/api/checkout/quotes', {
          paymentProvider: 'stripe-test', items: token.cart.items, shippingMethod: token.shippingMethod,
          destination: { country: location.country, region: location.region || '' },
        });
        if (!isQuote(quote) || quote.paymentProvider !== 'stripe-test' || quote.shippingMethod !== token.shippingMethod
          || quote.items.length !== token.cart.items.length || !token.cart.items.every((item) =>
            quote.items.some((quoted) => quoted.productId === item.productId && quoted.quantity === item.quantity))) {
          throw new Error('The order service could not confirm the Stripe quote. Review your order and try again.');
        }
        token.quote = quote;
        return { valid: true, live: toCheckoutLive(quote) };
      },
      capture: async () => { throw new Error('Continue to Stripe checkout to complete payment.'); },
      startPayment: (id) => withLock(async () => {
        const pending = readPending();
        if (pending) return submitSession(pending);
        const token = tokenFor(id);
        const current = local.demo.snapshot();
        if (!token.quote || current.id !== token.cart.id || current.revision !== token.cart.revision) {
          throw new Error('Your cart changed. Return to your cart and review the order again.');
        }
        const attempt = { version: 1, paymentProvider: 'stripe-test', quoteId: token.quote.id, key: crypto.randomUUID(),
          cart: { id: token.cart.id, revision: token.cart.revision } };
        savePending(attempt);
        return submitSession(attempt);
      }),
      pending: async () => {
        try { return readPending(); }
        catch (error) { return { unreadable: true, message: error.message }; }
      },
      recover: () => withLock(() => {
        const pending = readPending();
        if (!pending) throw new Error('There is no saved Stripe checkout to resume. Return to your cart to start checkout.');
        return submitSession(pending);
      }),
      completePayment: (order) => withLock(() => {
        if (!isPaidStripeOrder(order)) throw new Error('Stripe payment has not been confirmed. Your cart is unchanged.');
        const pending = readPending();
        let cleanup;
        if (pending && pending.quoteId === order.quoteId && (!pending.orderId || pending.orderId === order.id)) {
          cleanup = local.demo.completeSnapshot(pending.cart);
          if (cleanup.cleanupComplete) clearPending(pending);
        }
        return { id: order.id, customer_reference: order.reference, persistent: true, demo: false,
          payment_provider: 'stripe-test', payment_mode: 'test', status_payment: 'paid',
          receipt_url: `/orders/${order.id}`, live: toCheckoutLive(order), ...(cleanup?.cart ? { cart: cleanup.cart } : {}) };
      }),
      releaseCanceledPayment: (order) => withLock(() => {
        if (!isStripeOrder(order) || order.status !== 'CANCELED') throw new Error('The checkout has not been canceled.');
        const pending = readPending();
        if (pending && pending.quoteId === order.quoteId && (!pending.orderId || pending.orderId === order.id)) clearPending(pending);
      }),
    },
  };
}
