import { createDemoCommerce } from '../demo/commerce';
import { money } from '../demo/catalog';
import { isOrderReceipt, isQuote } from './order-contract';

export const PENDING_ORDER_KEY = 'joys-store-pending-order-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toCheckoutLive(quote) {
  return {
    line_items: quote.items.map((item) => ({ id: `line-${item.productId}`, product_id: item.productId,
      name: item.name, quantity: item.quantity, price: money(item.unitPriceCents), line_total: money(item.lineTotalCents) })),
    subtotal: money(quote.subtotalCents), shipping: { price: money(quote.shippingCents) },
    tax: { amount: money(quote.taxCents), included_in_price: false }, total_with_tax: money(quote.totalCents),
  };
}

export function createPersistentDemoCommerce({ storage, fetchImpl = globalThis.fetch, delayMs = 200,
  lockManager = globalThis.navigator?.locks } = {}) {
  const local = createDemoCommerce({ storage, delayMs });
  const recoveryStorage = storage || {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
  const checkouts = new Map();

  const withCheckoutLock = async (operation) => {
    if (typeof lockManager?.request !== 'function') {
      throw new Error('This browser cannot safely coordinate checkout. Update this browser and open the store using HTTPS, then retry. Your cart and saved checkout attempt are unchanged.');
    }
    let acquired = false;
    try {
      // All tabs share this lock. Keep it until submission and cleanup finish;
      // localStorage read/check/remove by itself is not an atomic operation.
      return await lockManager.request(PENDING_ORDER_KEY, { mode: 'exclusive' }, () => {
        acquired = true;
        return operation();
      });
    } catch (error) {
      if (!acquired) throw new Error('This browser could not coordinate checkout. Close other checkout tabs and retry. Your cart and saved checkout attempt are unchanged.', { cause: error });
      throw error;
    }
  };

  const readPending = () => {
    let value;
    try { value = recoveryStorage.getItem(PENDING_ORDER_KEY); }
    catch { throw new Error('Browser storage is needed to recover an order safely. Please enable it before placing an order.'); }
    if (!value) return null;
    try {
      const pending = JSON.parse(value);
      if (pending.version !== 1 || !uuid.test(pending.key) || !/^quote_[0-9a-f-]{36}$/i.test(pending.quoteId)
        || typeof pending.cart?.id !== 'string' || !Number.isSafeInteger(pending.cart.revision)) throw new Error();
      return pending;
    } catch { throw new Error('The saved checkout attempt could not be read. An earlier order may have completed; do not start another purchase until it is recovered.'); }
  };
  const savePending = (pending) => {
    try {
      const value = JSON.stringify(pending);
      recoveryStorage.setItem(PENDING_ORDER_KEY, value);
      if (recoveryStorage.getItem(PENDING_ORDER_KEY) !== value) throw new Error();
    } catch { throw new Error('Your checkout recovery details could not be saved. No order was submitted. Please enable browser storage and try again.'); }
  };
  const clearPending = (completed) => {
    try {
      const current = readPending();
      if (current?.key === completed.key && current.quoteId === completed.quoteId
        && current.cart.id === completed.cart.id && current.cart.revision === completed.cart.revision) {
        recoveryStorage.removeItem(PENDING_ORDER_KEY);
      }
    } catch { /* A retained key safely replays the same order. */ }
  };
  const request = async (path, body, headers = {}) => {
    let response;
    try {
      response = await fetchImpl(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    } catch { throw new Error('We could not confirm the response. Your order may already be saved. Retry to recover the same order; your cart is preserved.'); }
    let result;
    try { result = await response.json(); } catch { throw new Error('The order service returned an unreadable response. Retry to recover the same order.'); }
    if (!response.ok) {
      const error = new Error(result.error?.message || 'The order service is temporarily unavailable. Please try again.');
      error.code = result.error?.code;
      throw error;
    }
    return result;
  };
  const commit = async (pending) => {
    let receipt;
    try { receipt = await request('/api/demo/orders', { quoteId: pending.quoteId }, { 'Idempotency-Key': pending.key }); }
    catch (error) {
      // A missing quote can belong to another guest after a cookie change.
      // Only an owned, unconsumed expired quote proves submission did not occur.
      if (error.code === 'QUOTE_EXPIRED') clearPending(pending);
      throw error;
    }
    if (!isOrderReceipt(receipt) || receipt.quoteId !== pending.quoteId) {
      throw new Error('The order service did not return a valid receipt. Retry to recover the same order.');
    }
    // A committed order remains successful even if local cart cleanup fails.
    let cleanup;
    try { cleanup = local.demo.completeSnapshot(pending.cart); } catch { /* Recovery will retry cleanup. */ }
    if (cleanup?.cleanupComplete) clearPending(pending);
    return { id: receipt.id, customer_reference: receipt.reference, demo: true, persistent: true,
      status_payment: 'simulated', receipt_url: `/orders/${receipt.id}`, live: toCheckoutLive(receipt),
      ...(cleanup?.cart ? { cart: cleanup.cart } : {}) };
  };
  const tokenFor = (id) => {
    const token = checkouts.get(id);
    if (!token) throw new Error('This checkout has expired. Return to your cart and review the order again.');
    return token;
  };
  return {
    ...local,
    checkout: {
      ...local.checkout,
      generateToken: async (...args) => {
        const token = await local.checkout.generateToken(...args);
        checkouts.set(token.id, { cart: local.demo.snapshot(), quote: null, failureUsed: false });
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
        const quote = await request('/api/demo/quotes', {
          items: token.cart.items, shippingMethod: token.shippingMethod,
          destination: { country: location.country, region: location.region || '' },
        });
        if (!isQuote(quote)) throw new Error('The order service could not confirm the quote. Please try again.');
        token.quote = quote;
        return { valid: true, live: toCheckoutLive(quote) };
      },
      capture: (id, order = {}) => withCheckoutLock(() => {
        if (order.payment?.gateway !== 'demo') throw new Error('Persistent demo orders only accept simulated payments.');
        const pending = readPending();
        if (pending) return commit(pending);
        const token = tokenFor(id);
        const current = local.demo.snapshot();
        if (!token.quote || current.id !== token.cart.id || current.revision !== token.cart.revision) {
          throw new Error('Your cart changed. Return to your cart and review the order again.');
        }
        if (order.payment.demo?.failOnce && !token.failureUsed) {
          token.failureUsed = true;
          throw new Error('Simulated payment failure. No charge was made and your cart is unchanged. Try again to complete the demo.');
        }
        const attempt = { version: 1, quoteId: token.quote.id, key: crypto.randomUUID(), cart: { id: token.cart.id, revision: token.cart.revision } };
        savePending(attempt);
        return commit(attempt);
      }),
      pending: async () => {
        try { return readPending(); } catch (error) { return { unreadable: true, message: error.message }; }
      },
      recover: () => withCheckoutLock(() => {
        const pending = readPending();
        if (!pending) throw new Error('There is no pending order to recover. Return to your cart to start checkout.');
        return commit(pending);
      }),
    },
  };
}
