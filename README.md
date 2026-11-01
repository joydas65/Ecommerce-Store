# Joy's Store

A Next.js storefront with a seeded demo you can purchase from without merchant credentials. The same catalog, cart, and shipping flow also supports the live Commerce.js and Stripe integration.

The portfolio direction is a polished, single-store commerce demo that shows the complete journey from a shopper placing an order to a merchant managing it. The goal is to demonstrate senior full-stack engineering through clear product decisions, reliable transactions, maintainable boundaries, and evidence from tests.

**Current status:** the Next.js foundation and credential-free purchasing demo are implemented. Demo orders are explicitly simulated. Application APIs, a database, and merchant tools remain planned.

## What works today

- Next.js App Router routes for the catalog (`/`), cart (`/cart`), and checkout (`/checkout`), including direct navigation and reloads.
- Responsive product cards and cart quantity, removal, and clearing actions.
- Six seeded products with local illustrations, a cart that survives reloads, sample address entry, and simulated order confirmations.
- A controlled payment failure that preserves the cart and lets the shopper retry.
- Shipping country, region, and delivery-method selection, including countries without regions.
- Order review based on the selected provider's shipping and tax calculations.
- Confirmation only after a successful capture returns an order; references come from the provider.
- Visible service errors and retries, address restoration when going back, and protection against repeated in-flight payment submissions.
- Checkout regression tests and production-browser smoke tests, with automated lint, test, and build checks.

## Foundation and architecture

| Area | Choice |
| --- | --- |
| Framework | Next.js 16.4.3 App Router with React 19.3.1 |
| Runtime | Node.js 24.22.2, pinned in `.nvmrc` |
| Package manager | npm 11.19.1, one committed `package-lock.json`, exact dependency versions |
| UI | Material UI 9.5.0 with Emotion and the Next.js App Router cache provider |
| Forms and payments | React Hook Form 7 and Stripe Elements |
| Verification | ESLint, Jest/React Testing Library, and Playwright |

```mermaid
flowchart LR
    Shopper[Shopper] --> Next[Next.js routes and rendered shell]
    Next --> UI[Client storefront and checkout]
    UI --> State[Shared commerce state]
    State --> Adapter[Shared browser commerce interface]
    UI -->|Shipping and checkout operations| Adapter
    Adapter -->|Default demo| Demo[Seeded local provider]
    Demo --> Cart[Browser cart storage]
    Adapter -->|Explicit live mode| Commerce[Commerce.js API]
    UI -->|Live payment method creation| Stripe[Stripe.js / Elements]
    Stripe -->|Payment method identifier| UI
```

`src/app` owns routing, metadata, the shared layout, and UI providers. `src/context/CommerceContext.jsx` preserves catalog and cart state across route navigation. Components under `src/components/CheckoutForm` collect the address, request totals, submit payment, and display the returned order.

`src/lib/commerce.js` selects a provider lazily in the browser. Demo is the default; only `NEXT_PUBLIC_COMMERCE_MODE=live` selects Commerce.js. Merchant keys alone never enable live payments, and a live error never falls back to a simulated success. Importing or building a route does not initialize either provider. The application shell is rendered by Next.js; product data, cart state, and checkout remain client-side. There are no application API endpoints or database yet.

The demo provider uses integer cents, $5 standard or $12 express shipping, and a clearly labeled **8% sample tax** on products plus shipping. These are demonstration rules, not real tax or delivery quotes. Cart storage contains product IDs, quantities, and cart identity/version only. Address details and payment data are not saved or sent to a merchant. If browser storage is unavailable, the cart works in memory for the current page session.

The SDK’s Axios dependency is pinned to the patched 0.34.0 release through a scoped override. Contract tests cover the request and response shapes used by this app.

In live mode, the browser passes a Stripe payment-method identifier to Commerce.js for order capture. Decision records explain the [framework foundation](docs/decisions/0001-next-foundation.md) and [demo provider boundary](docs/decisions/0002-seeded-demo.md).

## Run locally

Use Node.js **24.22.2** and npm **11.19.1**. If you use nvm, `nvm install` and `nvm use` read the pinned version from `.nvmrc`.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). **No environment file, merchant account, or payment details are needed for the demo.**

### Try the demo

1. Add a Desk Mat and open the cart. Adjust quantities or reload to see the cart persist.
2. Choose **Checkout**, then **Use sample address**. Select a shipping option and continue.
3. Review the shipping and sample tax, then choose **Place demo order**. One Desk Mat with standard shipping totals **$42.12**.
4. Optionally select **Simulate a payment failure** before submitting. The first attempt shows an error and preserves the cart; the next attempt completes normally.
5. The confirmation has a `DEMO-` reference. No payment is collected and nothing is shipped. Return to the catalog to repeat; **Empty Cart** clears a saved cart.

### Optional live mode

Create an ignored `.env.local` (see `.env.example`) with your own public configuration:

```dotenv
NEXT_PUBLIC_COMMERCE_MODE=live
NEXT_PUBLIC_COMMERCE_PUBLIC_KEY=your_commerce_public_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
```

Configure products, shipping options, and the Stripe gateway in the connected Commerce.js store, then restart development. Explicit live mode with missing merchant keys shows a recoverable unavailable state. Set the mode back to `demo` to return to simulation. Demo and live carts use separate storage.

Next.js exposes `NEXT_PUBLIC_*` values to the browser and includes them in the build. Use only public or publishable keys, and rebuild after changing them for production. The old `REACT_APP_*` names are no longer used. Do not commit `.env.local` or place secret keys in browser configuration.

To run a production build locally:

```sh
npm run build
npm start
```

## Verify changes

| Command | Purpose |
| --- | --- |
| `npm run lint` | Check the codebase with no allowed lint warnings |
| `npm test` | Run Jest; append `-- --watch` for watch mode |
| `npm run test:ci` | Run the regression suite serially in CI mode |
| `npm run build` | Create the production Next.js build |
| `npm run check` | Run lint, regression tests, and the production build |
| `npm run test:e2e` | Run demo purchase tests, then live-mode foundation checks against separate production builds |
| `npm run test:e2e:demo` | Run only the seeded purchase and recovery browser tests |
| `npm run test:e2e:live` | Run only the live-mode checks with merchant keys deliberately absent |

Install Playwright's browser before the first browser-test run:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternatively, use an already installed Google Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

The Jest suite covers confirmed and failed captures, slow responses, duplicate submissions, cart preservation, shipping/tax calculations, lookup failures, stale responses, and address restoration. Demo provider tests also cover persisted cart validation, stale checkout rejection, failure recovery, and repeated capture. Provider selection tests prevent implicit live mode or simulated fallbacks. Component tests mock provider interactions. SDK contract tests use the real Commerce.js and Axios packages with an injected in-memory HTTP adapter. No test charges a card or proves live provider integration correctness.

Playwright uses the real demo implementation to exercise browsing, cart mutations and reloads, shipping totals, completed purchases, and controlled failure recovery. It rejects off-origin HTTP requests, uncaught errors, and hydration errors in demo mode. A separate production build verifies live-mode unavailable states, direct navigation/reloads, and the not-found page without merchant keys. Reports for each mode are kept separately.

[GitHub Actions](.github/workflows/ci.yml) runs lint, Jest, and the production Playwright checks on pushes and pull requests. Browser traces and screenshots are saved locally on failure. No merchant credentials are required by CI.

## Portfolio roadmap

Each milestone should leave a working, demonstrable application. Scope is one store and one merchant workflow.

| Milestone | Status and concrete result | Engineering discussion it supports |
| --- | --- | --- |
| 1a. Project foundation | Implemented: maintained runtime, Next.js routes, npm lockfile, modern UI dependencies, and automated checks | Reproducibility, framework boundaries, migration safety |
| 1b. Reproducible purchasing demo | Implemented: seeded products, explicit simulation mode, simulated purchases, and controlled failure recovery | Provider interfaces, deterministic testing, integration design |
| 2. Complete shopper experience | Planned: branding, product details, discovery, mobile polish, keyboard access, and measured performance | Product judgment, accessibility, frontend architecture |
| 3. Full-stack order workflow | Planned: application API and database, authoritative price/availability checks, persisted orders, and authenticated merchant order management | Data modeling, authorization, concurrency, transaction boundaries |
| 4. Reliable operation | Planned: duplicate-safe processing, provider reconciliation, deeper browser/API tests, structured diagnostics, and recovery instructions | Failure handling, observability, security, operating a service |
| 5. Interview presentation | Planned: hosted demo, screenshots, decision records, measured results, and a walkthrough of success and failure paths | Explaining tradeoffs and supporting claims with evidence |

### Next milestone: polish the shopper experience

Improve product details, discovery, mobile interactions, and keyboard accessibility in small steps, with measured performance and a consistent visual identity.

## Current limits

- The demo is browser-local. It does not reserve stock, process money, persist real orders, or synchronize accounts across devices.
- Checkout tokens and simulated confirmations live in memory. Reloading checkout starts again with the saved cart; reloading a completed order shows the now-empty cart.
- Live shipping and tax amounts come from Commerce.js; demo totals use the documented sample rules.
- In-flight button protection applies to the current UI session. Server-side idempotency and recovery after ambiguous payment outcomes remain future work.
- A functioning merchant account is still needed for real catalog and checkout behavior. Provider sandbox checks, application order persistence, and operational monitoring remain future work.
- Planned features and metrics should be presented as completed only after implementation and verification.
