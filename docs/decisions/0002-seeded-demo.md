# 0002: Make a local, explicitly simulated purchase flow the default

- Date: 2026-11-01
- Status: Accepted

## Context

An interviewer should be able to explore a complete purchase without a merchant account, SDK keys, or card details. The foundation already separates browser commerce calls from React state and preserves checkout correctness through tests. The next increment should exercise that same UI and its failure handling.

## Decision

Use a shared, asynchronous commerce interface with two implementations. `src/lib/commerce.js` exposes only the operations the storefront consumes:

| Operation | Result and behavior |
| --- | --- |
| `products.list()` | `{ data: Product[] }` with stable IDs, description, price, and image |
| `cart.retrieve()` / `cart.refresh()` | A cart with ID, items, quantities, and subtotal |
| `cart.add/update/remove/empty()` | `{ cart }` after a validated mutation |
| `checkout.generateToken(cartId, { type: 'cart' })` | `{ id, live }` containing a checkout snapshot |
| `checkout.getShippingOptions(tokenId, location)` | Available delivery options and prices |
| `checkout.checkShippingOption()` / `checkout.setTaxZone()` | `{ valid, live }`; final totals come from the provider |
| `checkout.capture(tokenId, orderData)` | A confirmed order or a rejected promise; failures preserve the cart |
| `services.localeListShippingCountries()` / `localeListSubdivisions()` | Keyed country/region choices |

Default to demo mode. Only the explicit build-time value `NEXT_PUBLIC_COMMERCE_MODE=live` selects the live adapter. Missing or unrecognized mode values remain demo; the always-visible demo notice makes that state apparent. Existing merchant keys never change the selected mode. Live failures never become demo successes.

The demo implementation supplies six products and local SVG illustrations, requiring no external asset or commerce requests. Prices use integer cents. Shipping costs $5 standard or $12 express. An 8% sample tax applies to the product subtotal plus shipping, rounded once to the nearest cent. These rules are labeled as examples, not real tax calculations.

Persist only cart IDs, revisions, product IDs, and quantities in a namespaced localStorage entry. Validate stored data and recover from corruption. Fall back to in-memory state when storage is unavailable. Refresh the UI on storage events so another tab's completed purchase does not strand an outdated checkout. Keep addresses, email, checkout tokens, and order confirmations out of persistent storage. A sample-address button avoids requiring personal information.

Checkout snapshots bind to the cart revision. Reject empty or stale checkout attempts. Successful capture clears the cart and returns an unmistakable `DEMO-` reference. Repeating capture for the same token in the same provider session returns the original result. A demo-only checkbox causes one known failure before capture; it preserves the cart and permits a successful retry.

Payment UI shares the order summary and checkout orchestration while separating simulated submission from Stripe Elements. Demo mode never initializes Stripe, including when a publishable key is present. Confirmation states explicitly say no payment was collected and nothing will ship.

## Tradeoffs and boundaries

- A browser provider makes the demo reproducible and inexpensive to host. Its data and calculations are user-controlled and unsuitable as authority for real transactions.
- This is an incremental adapter around the existing Commerce.js response shapes, not a new domain model or backend rewrite.
- Persistent carts survive reloads in the same browser. Checkout state and receipts are session-local; there is no order history, cross-device storage, or real inventory.
- Repeated-capture protection demonstrates a useful contract within one browser session. Durable server-side idempotency, concurrent account updates, and ambiguous real payment outcomes require a backend and remain future work.
- The deliberate failure is a known rejection before simulated capture. It does not model a lost response after a real provider has charged a customer.

## Verification

Unit tests exercise provider selection, money calculations, storage recovery, stale checkout rejection, cart preservation, and duplicate capture. Component tests exercise simulated payment success and recovery alongside the live checkout regressions. Production browser tests exercise a complete demo purchase with no merchant configuration, verify exact totals and cart clearing, and reject off-origin requests. A separate live-mode build retains the missing-configuration smoke tests.
