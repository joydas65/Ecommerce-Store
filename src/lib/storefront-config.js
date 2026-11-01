const choices = {
  NEXT_PUBLIC_CATALOG_PROVIDER: ['seeded', 'commercejs'],
  NEXT_PUBLIC_PAYMENT_PROVIDER: ['simulated', 'stripe'],
  NEXT_PUBLIC_ORDER_STORAGE: ['local', 'remote', 'commercejs'],
};

function explicitOrDefault(env, name, fallback) {
  const value = env[name];
  if (value === undefined) return fallback;
  if (!choices[name].includes(value)) {
    // Name the setting, never echo an arbitrary environment value or credential.
    throw new Error(`Invalid storefront configuration: ${name} must be ${choices[name].join(' or ')}.`);
  }
  return value;
}

export function getStorefrontConfig(env = {}) {
  // Legacy settings supply defaults only. New explicit capabilities always win.
  // Preserve the original credential-free default and the old live deployment.
  const legacyCommerce = env.NEXT_PUBLIC_COMMERCE_MODE === 'live';
  const catalogProvider = explicitOrDefault(env, 'NEXT_PUBLIC_CATALOG_PROVIDER', legacyCommerce ? 'commercejs' : 'seeded');
  const paymentProvider = explicitOrDefault(env, 'NEXT_PUBLIC_PAYMENT_PROVIDER', legacyCommerce ? 'stripe' : 'simulated');
  const orderStorage = explicitOrDefault(env, 'NEXT_PUBLIC_ORDER_STORAGE', legacyCommerce ? 'commercejs'
    : env.NEXT_PUBLIC_DEMO_ORDER_STORAGE === 'remote' ? 'remote' : 'local');
  const usesSeededCatalog = catalogProvider === 'seeded';
  const usesSimulatedPayment = paymentProvider === 'simulated';
  const usesPersistentOrders = orderStorage === 'remote';
  const usesLegacyCommerce = catalogProvider === 'commercejs' && paymentProvider === 'stripe' && orderStorage === 'commercejs';
  const usesHostedStripe = usesSeededCatalog && paymentProvider === 'stripe' && usesPersistentOrders;

  if (!(usesSeededCatalog && usesSimulatedPayment && ['local', 'remote'].includes(orderStorage)) && !usesLegacyCommerce && !usesHostedStripe) {
    throw new Error('Unsupported storefront configuration. Seeded products support simulated payment with local or remote orders, or Stripe test checkout with remote orders. Commerce.js products require Stripe payment and Commerce.js orders.');
  }

  return Object.freeze({ catalogProvider, paymentProvider, orderStorage,
    usesSeededCatalog, usesSimulatedPayment, usesPersistentOrders, usesLegacyCommerce, usesHostedStripe });
}

// Next.js only inlines public environment variables referenced by their static
// names. Keep this boundary explicit so server and browser resolve identically.
export const config = getStorefrontConfig({
  NEXT_PUBLIC_CATALOG_PROVIDER: process.env.NEXT_PUBLIC_CATALOG_PROVIDER,
  NEXT_PUBLIC_PAYMENT_PROVIDER: process.env.NEXT_PUBLIC_PAYMENT_PROVIDER,
  NEXT_PUBLIC_ORDER_STORAGE: process.env.NEXT_PUBLIC_ORDER_STORAGE,
  NEXT_PUBLIC_COMMERCE_MODE: process.env.NEXT_PUBLIC_COMMERCE_MODE,
  NEXT_PUBLIC_DEMO_ORDER_STORAGE: process.env.NEXT_PUBLIC_DEMO_ORDER_STORAGE,
});

export const { catalogProvider, paymentProvider, orderStorage,
  usesSeededCatalog, usesSimulatedPayment, usesPersistentOrders, usesLegacyCommerce, usesHostedStripe } = config;
