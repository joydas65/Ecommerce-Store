// Tests use fixture keys and never send real payment or commerce requests.
// Existing checkout regressions exercise the live path; demo tests opt in.
delete process.env.NEXT_PUBLIC_CATALOG_PROVIDER;
delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
delete process.env.NEXT_PUBLIC_ORDER_STORAGE;
process.env.NEXT_PUBLIC_COMMERCE_MODE = 'live';
process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY = 'pk_test_commerce_fixture';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_stripe_fixture';
