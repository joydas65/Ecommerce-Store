// Keep the legacy commerce SDK in the browser. Importing a page on the server
// must not initialize cookies, make requests, or require merchant credentials.
let clientPromise;

async function getClient() {
  const publicKey = process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY;
  if (typeof window === 'undefined' || !publicKey) {
    throw new Error('The store is temporarily unavailable. Please try again later.');
  }
  if (!clientPromise) {
    clientPromise = import('@chec/commerce.js')
      .then(({ default: Commerce }) => new Commerce(publicKey, false))
      .catch((error) => {
        clientPromise = undefined;
        throw error;
      });
  }
  return clientPromise;
}

const call = (resource, method) => async (...args) => {
  const client = await getClient();
  return client[resource][method](...args);
};

export const commerce = {
  products: { list: call('products', 'list') },
  cart: Object.fromEntries(['retrieve', 'add', 'update', 'remove', 'empty', 'refresh'].map((method) => [method, call('cart', method)])),
  checkout: Object.fromEntries(['generateToken', 'getShippingOptions', 'checkShippingOption', 'setTaxZone', 'capture'].map((method) => [method, call('checkout', method)])),
  services: Object.fromEntries(['localeListShippingCountries', 'localeListSubdivisions'].map((method) => [method, call('services', method)])),
};
