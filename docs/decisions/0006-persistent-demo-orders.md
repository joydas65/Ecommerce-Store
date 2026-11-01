# 0006 — Persistent demo orders in a separate Node.js service

## Context

Interviewers need to complete a simulated purchase and reload a saved receipt. A browser-only confirmation cannot demonstrate durable writes, authorization or recovery when a response disappears after a commit. The storefront stays on Vercel and the backend has its own repository and release lifecycle.

The initial Java Lambda/DynamoDB option was replaced with Node.js and PostgreSQL because this milestone must stay on free plans. Node.js itself does not remove hosting costs: the chosen deployment uses Vercel Hobby and Neon Free, whose quotas restrict service instead of billing overages. Java remains a possible future choice if its ecosystem or a concrete workload warrants the additional tooling.

## Decision

- Keep catalog and cart behavior behind the existing browser provider interface. Local demo mode remains available without credentials. Explicit remote mode fails closed when the service is unavailable.
- The browser calls same-origin Next.js routes. They check the request origin, cap request bodies, issue an HttpOnly/SameSite guest cookie, and forward only allowed headers. A separate server-only credential authenticates the storefront to the Node service. Neither credentials nor the guest cookie are returned in receipt data.
- The Node service owns the six-product price list, delivery amounts and 8% sample tax. Clients submit product IDs, quantities, a shipping method and country/region, never prices. A 15-minute quote freezes the values reviewed by the shopper.
- Order creation accepts only a quote ID and an idempotency key. A PostgreSQL transaction writes the order and replay result together; a uniqueness constraint prevents two orders from consuming the same quote. Repeated matching requests return the original receipt, including after the quote expires. Reusing a key for another request fails.
- Before submitting, the browser persists a minimal recovery record. A timeout is an unknown outcome, not a failed purchase. Retrying or reloading recovers the same attempt. The cart clears only after the receipt passes validation, and only if its identity and revision still match the purchased snapshot.
- A same-origin Web Lock serializes submission and recovery across tabs, including receipt cleanup. Cleanup removes only the matching attempt. Missing quotes remain ambiguous because a changed guest cookie can hide an existing order; only an owned, unconsumed expired quote proves that submission did not occur. Browsers without safe coordination stop before sending an order.
- `/orders/[id]` loads an uncached receipt from the backend. Receipt access is scoped to the guest cookie; missing, expired and other-guest receipts produce the same unavailable result. URLs are bookmarkable in the original browser, not transferable access tokens.
- Store only synthetic order snapshots. Names, email, street addresses, payment details and card information are excluded. Receipts expire after 30 days; scheduled cleanup removes expired records. Clearing cookies loses guest access. This is not account-based order history.

## Release and verification

The backend has its own verification and production migration checks. CI uses a real PostgreSQL service; untrusted pull requests do not receive production database credentials. Production schema changes run after verification, and Vercel must require both checks before assigning the backend production domain. Migrations are additive and versioned; rolling back application code does not roll back data.

The storefront pins the backend revision in its integration workflow. Tests exercise real HTTP/database writes, receipt reload, guest isolation, response-loss recovery and controlled failures. Backend tests cover price tampering, invalid requests, expiration, idempotency conflicts, concurrent submissions and rollback. A production browser gate verifies the deployed storefront's exact revision and storage mode.

## Tradeoffs and limits

Two repositories make the service boundary visible but require coordinated contract updates and releases. Shared-secret authentication is deliberately small for this single caller; it requires rotation and is not customer authentication. Managed workload identity would remove that long-lived credential in a later infrastructure milestone.

Free hosting is appropriate for a noncommercial portfolio demo. Quota exhaustion and database cold starts are accepted availability limits; there is no production availability promise. Preview builds use local simulation and cannot access production orders. Real payments, inventory reservations, fraud controls, customer accounts, merchant administration and reconciliation remain outside this milestone. The sample tax is not a real tax calculation.

References: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Neon plan limits](https://neon.com/docs/introduction/plans), [node-postgres transactions](https://node-postgres.com/features/transactions).
