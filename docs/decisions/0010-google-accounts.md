# 0010 — Google sign-in for shoppers and merchants

Status: implemented and locally verified. Google Cloud registration, production configuration, and real deployed OAuth verification are pending.

## Context

Google gives shoppers a familiar way to return to their orders from another browser. The existing private merchant workspace also needs Google sign-in while retaining its approved GitHub identity and historical audit actor. A successful public shopper login must never grant access to the store's merchant orders or payment operations.

## Decision

Reuse the pinned Better Auth library in the existing Node order service. Keep two explicit security boundaries: public customer accounts and private merchant accounts, with separate database tables, signing secrets, cookies, route prefixes and session checks. This duplicates some authentication configuration, but avoids broadening the existing merchant user admission rule or making a public signup an administrator. Both systems use PostgreSQL sessions lasting eight hours, with no automatic refresh or cookie cache. Signing out revokes only the corresponding session.

The Google web OAuth client registers two fixed production callbacks on the storefront:

- `https://joys-store.vercel.app/api/customer-auth/callback/google`
- `https://joys-store.vercel.app/api/auth/callback/google`

Only basic OpenID identity, email and profile are requested. The backend verifies the provider token's signature, issuer, audience, expiry and nonce through Better Auth's verifier, in addition to its one-time OAuth state and PKCE. The stable Google subject identifies accounts. The storefront forwards only the selected cookie family and fixed request/redirect shapes; it has no Google credentials or database access.

## Merchant enrollment

Google cannot create a merchant account. An existing approved merchant signs in, chooses **Connect Google**, and completes Google authentication. The callback must carry the same active authorized merchant session that initiated linking. The account is linked to the existing internal user, retaining audit attribution. Automatic linking by matching email is disabled, and an already bound Google identity cannot move between merchants. Each subsequent merchant request still checks the immutable GitHub-ID allowlist, so removing that approval also removes access through Google.

Google sign-in is optional alongside GitHub. Unlinked merchants can always start with their approved GitHub identity. A canceled or failed Google connection displays a recoverable message without changing merchant access. A partial unique index enforces one Google identity per merchant when linking callbacks race; the losing callback returns a safe error without database details.

## Shopper ownership

Verified Google users may create customer accounts. **My orders** lists only retained orders whose `customer_user_id` matches the authenticated session, with cursor pagination and private, reloadable receipt details. All account pages are dynamic, no-store and noindex. API authorization is independent of page navigation.

Remote checkout derives the optional customer ID exclusively from the shopper session cookie. The initial order reservation writes ownership in the same transaction as the receipt and idempotency record. Replaying checkout cannot change ownership. A different signed-in account, or a change between guest and customer, returns `CUSTOMER_CHECKOUT_CHANGED`; an expired session requires sign-in before the same checkout can be retried. The browser preserves its recovery key and cart.

Guest checkout remains available. Historical guest orders are not automatically claimed when somebody signs in on a shared browser. Existing guest receipt access remains browser-bound; My orders provides a separate account-authorized read path. New order ownership is never inferred from an email address, submitted role, order ID, or service bearer. Account receipts are read-only in this increment, and payment truth continues to come from the existing verified Stripe flow.

Receipt retention remains 30 days after a resolved order, while unresolved Stripe payments remain retained. Account identity persists independently of receipt cleanup; account self-service deletion and historical guest-order claiming are future work. Provider tokens are encrypted in the backend auth tables and do not enter receipt DTOs, browser storage or request logs.

## Release and verification

Customer authentication and merchant Google are disabled by default and on previews. Customer accounts require remote order storage. Release the additive customer schema and compatible backend first, then pin that reviewed backend revision in storefront CI. Configure OAuth only after account-level setup is approved, store credentials only in backend production secrets, and enable the storefront flags in a new gated release.

Unit, PostgreSQL and browser tests cover forged/expired tokens, OAuth state/nonce replay, explicit linking and revocation, customer/merchant separation, private order ownership, checkout account changes, sign-out, empty/retry states, mobile navigation and reloads. Local browser OAuth initiation is intercepted before Google navigation; signed callback tests use controlled provider responses and real framework verification. These tests do not establish that the external Google client is correctly registered. A production shopper sign-in and purchase, merchant linking and subsequent Google login, plus sign-out checks must pass before claiming Google is live.

Local verification passed 649 storefront unit/component tests, 143 backend PostgreSQL tests, and 99 browser checks across the seeded demo, unavailable live catalog, persistent checkout, Stripe contract, merchant recovery and customer account suites. Lint, production builds, release-event and fixture-guard checks passed. The new three-test anonymous customer deployment gate is prepared; it has not been run against an activated production Google release.

## Tradeoffs

Separate auth domains keep the merchant security model easy to review and allow independent revocation. They require separate sessions even when one person is both shopper and merchant. Explicit linking adds a one-time step for merchants while preventing email-based privilege transfer. Account-specific ownership makes cross-device receipt access possible without weakening existing guest tokens; automatic guest-history import is deliberately deferred until a safe claim and shared-browser UX is designed.
