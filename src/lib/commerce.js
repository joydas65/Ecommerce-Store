import { usesLegacyCommerce, usesPersistentOrders, usesHostedStripe } from './storefront-config';

// Both implementations satisfy the small storefront contract below. Loading a
// route on the server never initializes storage, the SDK, or provider requests.
let clientPromise;

async function getClient() {
  if (typeof window === 'undefined') {
    throw new Error('The store is temporarily unavailable. Please try again later.');
  }
  if (!clientPromise) {
    clientPromise = (usesLegacyCommerce
      ? loadLiveCommerce()
      : usesHostedStripe
        ? import('./orders/stripe-checkout').then(({ createStripeCheckoutCommerce }) => createStripeCheckoutCommerce())
      : usesPersistentOrders
        ? import('./orders/persistent-demo').then(({ createPersistentDemoCommerce }) => createPersistentDemoCommerce())
        : import('./demo/commerce').then(({ createDemoCommerce }) => createDemoCommerce())
    ).catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

async function loadLiveCommerce() {
  const publicKey = process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('The store is temporarily unavailable. Please try again later.');
  }
  const { default: Commerce } = await import('@chec/commerce.js');
  return new Commerce(publicKey, false);
}

const call = (resource, method) => async (...args) => {
  const client = await getClient();
  return client[resource][method](...args);
};

/**
 * Storefront commerce port (all methods return promises).
 * products.list -> {data: Product[]}; cart reads -> Cart; mutations -> {cart}.
 * generateToken -> {id, live}; shipping/tax updates -> {valid, live}.
 * capture -> confirmed Order or rejection; locale lookups -> keyed choices.
 * See docs/decisions/0002-seeded-demo.md for guarantees and limitations.
 */
export const commerce = {
  products: { list: call('products', 'list') },
  cart: Object.fromEntries(['retrieve', 'add', 'update', 'remove', 'empty', 'refresh'].map((method) => [method, call('cart', method)])),
  checkout: Object.fromEntries(['generateToken', 'getShippingOptions', 'checkShippingOption', 'setTaxZone', 'capture', 'pending', 'recover', 'startPayment', 'completePayment', 'releaseCanceledPayment'].map((method) => [method, call('checkout', method)])),
  services: Object.fromEntries(['localeListShippingCountries', 'localeListSubdivisions'].map((method) => [method, call('services', method)])),
};
