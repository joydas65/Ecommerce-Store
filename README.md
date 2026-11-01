# Joy's Store

A Next.js storefront with a seeded demo you can purchase from without merchant credentials. The same catalog, cart, and shipping flow also supports the live Commerce.js and Stripe integration.

**[Open the live demo](https://joys-store.vercel.app)** — browse products, use the sample address, and complete a simulated purchase. No login or payment details are needed.

The portfolio direction is a polished, single-store commerce demo that shows the complete journey from a shopper placing an order to a merchant managing it. The goal is to demonstrate senior full-stack engineering through clear product decisions, reliable transactions, maintainable boundaries, and evidence from tests.

**Current status:** the Next.js foundation and credential-free purchasing demo are deployed on Vercel. GitHub CI and deployed purchase checks gate production releases. Demo orders are explicitly simulated. Commerce APIs, a database, and merchant tools remain planned.

The [Vercel release guide](docs/deployment.md) documents deployment checks, project configuration, release verification, and rollback recovery.

## What works today

- Next.js App Router routes for the catalog (`/`), products (`/products/[slug]`), cart (`/cart`), and checkout (`/checkout`), including direct navigation and reloads.
- Directly linked product pages with server-rendered descriptions, sample specifications and care guidance, individual page metadata, and loading, missing-product, and service-recovery states.
- Responsive product cards and cart quantity, removal, and clearing actions.
- A workspace-inspired storefront, shared visual theme, visible add actions, and confirmed cart feedback with a direct View cart action.
- Search names, descriptions, and sample specifications; sort by featured order, price, or name. Share `q`/`sort` URLs, restore results with browser history, and recover from empty results.
- Keyboard navigation, a skip link, and verified catalog layouts at phone, tablet, and desktop widths.
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
    Next --> Detail[Server-rendered product pages]
    Detail --> Reader[Server-only product reader]
    Reader --> Fixtures[Local sample product fixtures]
    Reader -->|Explicit live mode| Commerce[Commerce.js API]
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

`src/lib/commerce.js` selects a provider lazily in the browser. Demo is the default; only `NEXT_PUBLIC_COMMERCE_MODE=live` selects Commerce.js. Merchant keys alone never enable live payments, and a live error never falls back to a simulated success. Importing or building a route does not initialize either provider. Product detail routes read independently through `src/lib/product-reader.js`; their content and metadata render on the server, with a small client purchase control. Demo pages are pre-rendered from local fixtures. Live detail reads use bounded, uncached requests to the merchant API and distinguish missing products from temporary failures. The catalog list, cart state, and checkout remain client-side. `/api/health` exposes public release identity; commerce API endpoints and a database remain planned.

The demo provider uses integer cents, $5 standard or $12 express shipping, and a clearly labeled **8% sample tax** on products plus shipping. These are demonstration rules, not real tax or delivery quotes. Cart storage contains product IDs, quantities, and cart identity/version only. Address details and payment data are not saved or sent to a merchant. If browser storage is unavailable, the cart works in memory for the current page session.

The SDK’s Axios dependency is pinned to the patched 0.34.0 release through a scoped override. Contract tests cover the request and response shapes used by this app.

In live mode, the browser passes a Stripe payment-method identifier to Commerce.js for order capture. Decision records explain the [framework foundation](docs/decisions/0001-next-foundation.md), [demo provider boundary](docs/decisions/0002-seeded-demo.md), [catalog-to-cart experience](docs/decisions/0003-catalog-to-cart-experience.md), [product page boundaries](docs/decisions/0004-product-detail-pages.md), and [URL-driven catalog discovery](docs/decisions/0005-catalog-discovery.md), including screenshots.

## Run locally

Use Node.js **24.22.2** and npm **11.19.1**. If you use nvm, `nvm install` and `nvm use` read the pinned version from `.nvmrc`.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). **No environment file, merchant account, or payment details are needed for the demo.**

### Try the demo

1. Open the [Desk Mat product page](https://joys-store.vercel.app/products/desk-mat), review the sample details, add it, and open the cart. Adjust quantities or reload to see the cart persist.
2. Choose **Checkout**, then **Use sample address**. Select a shipping option and continue.
3. Review the shipping and sample tax, then choose **Place demo order**. One Desk Mat with standard shipping totals **$42.12**.
4. Optionally select **Simulate a payment failure** before submitting. The first attempt shows an error and preserves the cart; the next attempt completes normally.
5. The confirmation has a `DEMO-` reference. No payment is collected and nothing is shipped. Return to the catalog to repeat; **Empty Cart** clears a saved cart.

### Share a collection view

Try [desk products sorted by price](https://joys-store.vercel.app/?q=desk&sort=price-asc#products). Search is applied with **Search** or Enter; sorting applies immediately. **Clear search** keeps the sort, while **Reset filters** restores the featured collection. Reloading, copying the URL, and browser Back/Forward restore the applied view.

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
| `npm run test:e2e:deployed` | Verify a public demo deployment using `E2E_BASE_URL` and optional `E2E_EXPECTED_COMMIT_SHA` |

Install Playwright's browser before the first browser-test run:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternatively, use an already installed Google Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

The Jest suite covers confirmed and failed captures, slow responses, duplicate submissions, cart preservation, shipping/tax calculations, lookup failures, stale responses, and address restoration. Product tests cover independent reads, merchant response validation, missing versus unavailable states, metadata, loading UI, and confirmed purchase feedback. Discovery tests cover query normalization, shared URL behavior, literal matching, deterministic numeric sorting, draft input, and empty-state recovery. Demo provider tests also cover persisted cart validation, stale checkout rejection, failure recovery, and repeated capture. Provider selection tests prevent implicit live mode or simulated fallbacks. Component tests mock provider interactions. SDK contract tests use the real Commerce.js and Axios packages with an injected in-memory HTTP adapter. No test charges a card or proves live provider integration correctness.

Playwright uses the real demo implementation to exercise shared searches, sorting, browser history, empty-state recovery, catalog-to-detail navigation, all six product deep links and reloads, server content with JavaScript disabled, product HTTP 404 recovery, mobile keyboard use, cart mutations and reloads, shipping totals, completed purchases, and controlled failure recovery. It rejects off-origin HTTP requests, uncaught errors, and hydration errors in demo mode. A separate production build verifies live-mode unavailable states, direct navigation/reloads, and the not-found page without merchant keys. Reports for each mode are kept separately.

[GitHub Actions](.github/workflows/ci.yml) runs lint, Jest, release-event validation, and production Playwright checks on pushes and pull requests. The [deployment workflow](.github/workflows/deployment-checks.yml) verifies Vercel's built demo before native Deployment Checks permit production promotion. Browser reports are retained as seven-day workflow artifacts. No merchant credentials are required by CI; see the [release guide](docs/deployment.md) for the external Vercel settings needed to enable the gate.

## Portfolio roadmap

Each milestone should leave a working, demonstrable application. Scope is one store and one merchant workflow.

| Milestone | Status and concrete result | Engineering discussion it supports |
| --- | --- | --- |
| 1a. Project foundation | Implemented: maintained runtime, Next.js routes, npm lockfile, modern UI dependencies, and automated checks | Reproducibility, framework boundaries, migration safety |
| 1b. Reproducible purchasing demo | Implemented: seeded products, explicit simulation mode, simulated purchases, and controlled failure recovery | Provider interfaces, deterministic testing, integration design |
| 1c. Vercel release foundation | Deployed: Git integration, previews, CI and deployed purchase gates, release identity, and recovery instructions | Deployment safety, least-privilege automation, verifiable releases |
| 2. Complete shopper experience | Catalog branding, responsive cards, keyboard access, confirmed add feedback, directly linked product detail pages, and search/sorting with shareable URLs implemented | Product judgment, accessibility, frontend architecture |
| 3. Full-stack order workflow | Planned: application API and database, authoritative price/availability checks, persisted orders, and authenticated merchant order management | Data modeling, authorization, concurrency, transaction boundaries |
| 4. Reliable operation | Planned: duplicate-safe processing, provider reconciliation, deeper browser/API tests, structured diagnostics, and recovery instructions | Failure handling, observability, security, operating a service |
| 5. Interview presentation | Hosted demo and decision records available; a polished walkthrough, screenshots, and broader measured results remain planned | Explaining tradeoffs and supporting claims with evidence |

### Next milestone: full-stack order workflow

Establish an application API and persistent order model, with authoritative prices and totals and a bounded merchant workflow. Keep simulated orders explicit while demonstrating transaction boundaries and recovery across browser sessions.

## Current limits

- Search and sorting operate on the loaded collection. All six demo products are included; live merchant pagination and server-side full-catalog search remain future work.
- The demo is browser-local. It does not reserve stock, process money, persist real orders, or synchronize accounts across devices.
- Checkout tokens and simulated confirmations live in memory. Reloading checkout starts again with the saved cart; reloading a completed order shows the now-empty cart.
- Live shipping and tax amounts come from Commerce.js; demo totals use the documented sample rules.
- In-flight button protection applies to the current UI session. Server-side idempotency and recovery after ambiguous payment outcomes remain future work.
- A functioning merchant account is still needed for real catalog and checkout behavior. Provider sandbox checks, application order persistence, and operational monitoring remain future work.
- Planned features and metrics should be presented as completed only after implementation and verification.
