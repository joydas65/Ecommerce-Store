import { catalog, money, productDetails } from './catalog';
import { DEMO_CART_STORAGE_KEY } from './storage-key';

export { DEMO_CART_STORAGE_KEY } from './storage-key';
const countries = { US: 'United States', GB: 'United Kingdom', SG: 'Singapore' };
const regions = { US: { CA: 'California', NY: 'New York', TX: 'Texas' }, GB: {}, SG: {} };
const shippingOptions = [
  { id: 'demo-standard', description: 'Standard (3–5 business days)', cents: 500 },
  { id: 'demo-express', description: 'Express (1–2 business days)', cents: 1200 },
];
const products = new Map(catalog.map((product) => [product.id, product]));
const copy = (value) => JSON.parse(JSON.stringify(value));
const newId = (prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`;
const newCart = () => ({ id: newId('demo-cart'), revision: 0, items: [] });
const validQuantity = (quantity, allowZero = false) => Number.isInteger(quantity) && quantity >= (allowZero ? 0 : 1) && quantity <= 99;

function validStoredCart(value) {
  return value && typeof value.id === 'string' && /^demo-cart-[\w-]+$/.test(value.id)
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && Array.isArray(value.items) && value.items.length <= catalog.length
    && value.items.every((item) => item && products.has(item.productId) && validQuantity(item.quantity))
    && new Set(value.items.map((item) => item.productId)).size === value.items.length;
}

function cartView(state) {
  const line_items = state.items.map(({ productId, quantity }) => {
    const product = products.get(productId);
    return { ...productDetails(product), id: `line-${productId}`, product_id: productId, quantity, line_total: money(product.cents * quantity) };
  });
  return {
    id: state.id,
    line_items,
    total_items: state.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: money(state.items.reduce((sum, item) => sum + products.get(item.productId).cents * item.quantity, 0)),
  };
}

function validateLocation({ country, region = '' } = {}) {
  if (!Object.hasOwn(countries, country) || (country === 'US' ? !Object.hasOwn(regions.US, region) : region !== '')) {
    throw new Error('Choose a supported demo shipping destination.');
  }
  return { country, region };
}

// This local simulation intentionally models the app's commerce boundary, not
// a secure backend. It never persists customer, address, or payment details.
export function createDemoCommerce({ storage, delayMs = 200 } = {}) {
  let memory;
  let storageFailed = false;
  const tokens = new Map();

  function getStorage() {
    if (storageFailed) return null;
    try { return storage === undefined ? (typeof window === 'undefined' ? null : window.localStorage) : storage; }
    catch { storageFailed = true; return null; }
  }

  function save(state) {
    // Serialize an explicit allowlist, even if storage was changed by a visitor.
    memory = { id: state.id, revision: state.revision, items: state.items.map(({ productId, quantity }) => ({ productId, quantity })) };
    try { getStorage()?.setItem(DEMO_CART_STORAGE_KEY, JSON.stringify(memory)); }
    catch { storageFailed = true; }
    return memory;
  }

  function read() {
    const availableStorage = getStorage();
    if (!availableStorage) return memory || save(newCart());
    let saved;
    try { saved = availableStorage.getItem(DEMO_CART_STORAGE_KEY); }
    catch {
      storageFailed = true;
      return memory || save(newCart());
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (validStoredCart(parsed)) return save(parsed);
      } catch { /* Replace an invalid cart with a usable empty cart. */ }
      return save(newCart());
    }
    // An accessible but missing entry means another tab cleared storage. Do not
    // resurrect the old in-memory cart when responding to its storage event.
    return save(newCart());
  }

  const run = (operation) => async (...args) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return copy(operation(...args));
  };

  function change(operation) {
    const state = copy(read());
    operation(state);
    state.revision += 1;
    return { cart: cartView(save(state)) };
  }

  function tokenFor(id) {
    const token = tokens.get(id);
    if (!token) throw new Error('This demo checkout has expired. Return to your cart and start again.');
    const state = read();
    if (token.cartId !== state.id || token.revision !== state.revision) {
      throw new Error('Your cart changed. Return to your cart and start checkout again.');
    }
    return token;
  }

  function live(token) {
    const subtotal = token.items.reduce((sum, item) => sum + products.get(item.productId).cents * item.quantity, 0);
    const shipping = token.shipping?.cents || 0;
    const tax = token.taxReady ? Math.round((subtotal + shipping) * 8 / 100) : 0;
    return {
      line_items: cartView({ id: token.cartId, items: token.items }).line_items,
      subtotal: money(subtotal),
      shipping: { price: money(shipping) },
      tax: { amount: money(tax), included_in_price: false },
      total_with_tax: money(subtotal + shipping + tax),
    };
  }

  return {
    products: { list: run(() => ({ data: catalog.map(productDetails) })) },
    cart: {
      retrieve: run(() => cartView(read())),
      refresh: run(() => cartView(read())),
      add: run((productId, quantity = 1) => change((state) => {
        if (!products.has(productId) || !validQuantity(quantity)) throw new Error('Choose a valid demo product and quantity (1–99).');
        const item = state.items.find((item) => item.productId === productId);
        if (item) {
          if (!validQuantity(item.quantity + quantity)) throw new Error('You can add up to 99 of each demo product.');
          item.quantity += quantity;
        } else state.items.push({ productId, quantity });
      })),
      update: run((lineId, { quantity } = {}) => change((state) => {
        const item = state.items.find((item) => `line-${item.productId}` === lineId);
        if (!item || !validQuantity(quantity, true)) throw new Error('Choose a valid cart item and quantity (0–99).');
        if (quantity === 0) state.items = state.items.filter((entry) => entry !== item);
        else item.quantity = quantity;
      })),
      remove: run((lineId) => change((state) => {
        if (!state.items.some((item) => `line-${item.productId}` === lineId)) throw new Error('This demo cart item is no longer available.');
        state.items = state.items.filter((item) => `line-${item.productId}` !== lineId);
      })),
      empty: run(() => change((state) => { state.items = []; })),
    },
    checkout: {
      generateToken: run((cartId, { type } = {}) => {
        const state = read();
        if (type !== 'cart' || cartId !== state.id || !state.items.length) throw new Error('Add a product to your cart before starting demo checkout.');
        const id = newId('demo-checkout');
        const token = { cartId, revision: state.revision, items: copy(state.items) };
        tokens.set(id, token);
        return { id, live: live(token) };
      }),
      getShippingOptions: run((id, location) => {
        tokenFor(id);
        validateLocation(location);
        return shippingOptions.map(({ id, description, cents }) => ({ id, description, price: money(cents) }));
      }),
      checkShippingOption: run((id, { shipping_option_id, ...location } = {}) => {
        const token = tokenFor(id);
        const destination = validateLocation(location);
        const option = shippingOptions.find((option) => option.id === shipping_option_id);
        if (!option) throw new Error('Choose a supported demo shipping option.');
        token.shipping = option;
        token.location = destination;
        token.taxReady = false;
        return { valid: true, live: live(token) };
      }),
      setTaxZone: run((id, { postal_zip_code, ...location } = {}) => {
        const token = tokenFor(id);
        const destination = validateLocation(location);
        if (!token.shipping || token.location.country !== destination.country || token.location.region !== destination.region
          || typeof postal_zip_code !== 'string' || !postal_zip_code.trim()) throw new Error('Choose shipping and enter a postal code before reviewing your demo total.');
        token.taxReady = true;
        token.postalCode = postal_zip_code;
        return { valid: true, live: live(token) };
      }),
      capture: run((id, order = {}) => {
        if (order.payment?.gateway !== 'demo') throw new Error('Demo checkout only accepts simulated payments.');
        const completed = tokens.get(id)?.receipt;
        if (completed) return completed;
        const token = tokenFor(id);
        if (!token.taxReady || order.fulfillment?.shipping_method !== token.shipping?.id
          || order.shipping?.country !== token.location?.country
          || (order.shipping?.county_state || '') !== token.location?.region
          || order.shipping?.postal_zip_code !== token.postalCode) throw new Error('Review your shipping and demo total before placing the order.');
        if (order.payment.demo?.failOnce && !token.failureUsed) {
          token.failureUsed = true;
          throw new Error('Simulated payment failure. No charge was made and your cart is unchanged. Try again to complete the demo.');
        }
        const reference = newId('DEMO').toUpperCase();
        token.receipt = {
          id: reference, customer_reference: reference, status_payment: 'paid', demo: true,
          customer: { firstname: typeof order.customer?.firstname === 'string' ? order.customer.firstname : '' },
          live: live(token),
        };
        save(newCart());
        return token.receipt;
      }),
    },
    services: {
      localeListShippingCountries: run((id) => { tokenFor(id); return { countries }; }),
      localeListSubdivisions: run((country) => {
        if (!Object.hasOwn(regions, country)) throw new Error('Choose a supported demo country.');
        return { subdivisions: regions[country] };
      }),
    },
  };
}
