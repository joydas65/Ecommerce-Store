# 0010 — Google sign-in for shoppers and merchants

Status as of 2026-11-05: production Google shopper sign-in, a signed-in test purchase, and shopper sign-out are verified. Existing GitHub merchant access is also verified after release. Merchant Google linking and subsequent sign-in still await owner confirmation at the linking step.

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

Receipt retention remains 30 days after a resolved order, while unresolved Stripe payments remain retained. Account identity persists independently of receipt cleanup; account self-service deletion and historical guest-order claiming are future work. OAuth access and refresh tokens are encrypted in the backend auth tables; the validated ID token is also stored there. Provider tokens do not enter receipt DTOs, browser storage or request logs.

## Release and verification

Customer authentication and merchant Google remain disabled by default and on previews. Customer accounts require remote order storage. The approved production setup uses the dedicated Google project `joys-store-auth-2026`, with an External audience marked In production and only `openid`, `email` and `profile` scopes. Its web client has the two exact callbacks above. No billing account is attached: an automatic association during project creation was removed immediately, and the console confirmed that no billing account remained. Google credentials and session secrets are configured only in backend production; the storefront receives only capability flags and fixed origins.

The additive customer schema and compatible backend were released before the storefront. Backend revision `10bdc21` passed [verification and the production migration](https://github.com/joydas65/Ecommerce-Orders/actions/runs/41991688391). Storefront revision `e95ebc9` pins that backend and passed [CI](https://github.com/joydas65/Ecommerce-Store/actions/runs/41992225871) with 653 unit/component tests and 99 browser checks. Its [production deployment gate](https://github.com/joydas65/Ecommerce-Store/actions/runs/41992493394) passed all eight checks, including the three anonymous customer checks. The gate verifies deployed behavior and access denial without contacting Google; it does not replace real OAuth acceptance.

Unit, PostgreSQL and browser tests cover forged/expired tokens, OAuth state/nonce replay, explicit linking and revocation, customer/merchant separation, private order ownership, checkout account changes, sign-out, empty/retry states, mobile navigation and reloads. Local browser OAuth initiation is intercepted before Google navigation; signed callback tests use controlled provider responses and real framework verification. These tests do not establish that the external Google client is correctly registered.

Real Google shopper sign-in on the canonical storefront succeeded. A new signed-in Notebook purchase for $18.36 completed through Stripe sandbox checkout using its test card, appeared in **My orders**, and retained its private receipt after a full page reload. Historical guest orders were not imported. After shopper sign-out, opening that private account receipt redirected to `/account/sign-in`. Signing in again through Google restored the same paid order history. Shopper sign-out left the separate existing GitHub merchant session authorized. No real charge was made.

The existing GitHub merchant login succeeded after release and displayed the new paid test order and **Connect Google** action. Merchant Google linking still awaits the owner's confirmation at that action; subsequent Google merchant sign-in and sign-out acceptance remain pending. Do not describe both Google authentication flows as fully accepted until those checks pass. Backend PostgreSQL verification previously passed 143 tests; lint, production builds, release-event and fixture-guard checks also passed.

## Tradeoffs

Separate auth domains keep the merchant security model easy to review and allow independent revocation. They require separate sessions even when one person is both shopper and merchant. Explicit linking adds a one-time step for merchants while preventing email-based privilege transfer. Account-specific ownership makes cross-device receipt access possible without weakening existing guest tokens; automatic guest-history import is deliberately deferred until a safe claim and shared-browser UX is designed.
