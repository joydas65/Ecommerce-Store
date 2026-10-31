// Tests use fixture keys and never send real payment or commerce requests.
process.env.NEXT_PUBLIC_COMMERCE_PUBLIC_KEY = 'pk_test_commerce_fixture';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_stripe_fixture';
