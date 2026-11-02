# 0009 — Audited merchant payment recovery

Status: accepted. Implemented and locally verified; deployed checks and authenticated Stripe verification follow the release guide.

## Context

The merchant inbox can inspect unresolved Stripe test payments, but only a shopper reconciliation request or signed webhook could previously refresh their saved state. An operator needs a bounded recovery action with a visible record of what was requested and what actually changed.

## Decision

Add **Recheck payment status** to the merchant order detail page. The backend retrieves the order's already-bound Stripe Checkout Session. It shares the established verification and transaction logic with webhook processing: the session, test mode, ownership, items, totals and currency must match before payment can be confirmed. This operation never creates a payment session, expires one, or accepts a payment status from the browser.

The merchant's database session is the authority for this action. Both the storefront BFF and backend require the exact canonical storefront Origin on POST. The BFF forwards only the approved merchant cookies, canonical Origin and a bounded `{ requestId }` payload. A guest cookie, checkout service bearer, actor header, order ID or client-supplied role cannot grant merchant access.

## Recovery and concurrency

The browser generates a request UUID and saves it in session storage before submitting. A network failure is ambiguous: the server may have completed the check. **Recover previous check** therefore reuses that UUID, including after a reload. The backend persists the request before contacting Stripe. Replaying a completed request returns its recorded outcome and the current saved order without another provider call.

Database coordination allows one active check per order. In-flight duplicates return a bounded retry time. A lease permits recovery after a terminated function; a stale worker cannot finalize a superseded request. Per-order cooldowns and per-merchant rate limits live in PostgreSQL, so creating another function instance does not reset them.

Stripe retrieval occurs outside the order transaction. Finalization locks the same order row used by webhook updates and rechecks its current state. A concurrent paid or canceled result wins over an older merchant observation. The resulting order state, final audit event and completed request are committed in one transaction. A failed transaction cannot record an unaudited payment change.

Provider failures are completed check attempts with a `provider_unavailable` outcome. An HTTP 200 acknowledges the recorded operation; it is not a successful payment. The UI displays the outcome explicitly and retains the current saved payment status. Transport or database failures without a recorded result remain recoverable with the same UUID.

## Audit history

The protected history endpoint returns eligibility and the latest 20 events, with an explicit truncation indicator. Requested and final events include the stable merchant user ID, server-derived display name, timestamp, outcome and previous/result payment statuses. Provider secrets, raw errors, guest identifiers and Stripe session IDs are omitted. Display names are informational snapshots; the persisted user ID establishes the actor.

Events are append-only through the application. This is an operational audit trail, not a claim of tamper resistance against the database owner. Audit retention follows retained orders, including unresolved payments. It does not reconstruct actions taken before this feature existed.

## Verification

Local verification passed 556 storefront tests, 102 backend PostgreSQL tests, and 92 browser checks (15 merchant checks, including eight new payment-recovery scenarios). Lint/syntax, release and fixture-guard tests, backend dependency audit, and production builds also passed. These establish implementation evidence; each deployment is independently gated and verified.

- Backend tests use PostgreSQL to exercise duplicate requests, concurrent webhooks, stale leases, rate limits, provider failures, rejected evidence and atomic finalization.
- BFF tests cover exact origins, merchant-cookie isolation, bounded payloads, fixed destinations, safe error projections and ambiguous responses.
- Component tests cover action eligibility, durable retry keys, timeline validation, status feedback and stale request handling.
- Browser checks run the real Next.js application, backend authentication, PostgreSQL and Stripe SDK. A separate guarded test process supplies an HTTP Stripe fixture for payment, expiry, mismatch, timeout and concurrent-webhook scenarios. No fixture route or provider-host override is added to the production runtime.
- Deployed checks exercise anonymous history denial and cross-origin write rejection. Authenticated production verification uses the canonical storefront origin and Stripe test orders separately.

## Tradeoffs

This increment uses the existing Node service and PostgreSQL instead of introducing a queue. Each check is a single bounded retrieval; a failed or interrupted request is recoverable. It does not schedule automatic reconciliation. A future background worker can reuse the same verified state transition with an explicit system actor and its own retry policy.

Payment recovery and fulfillment remain separate operations. This feature changes saved payment state only when supported by Stripe evidence; it does not introduce refunds, shipment updates, stock reservations or real-money payments.
