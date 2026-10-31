# 0001: Use Next.js for the commerce application foundation

- Date: 2026-11-01
- Status: Accepted

## Context

Joy's Store began as a Create React App storefront. Catalog, cart, shipping, and order operations use Commerce.js, and Stripe Elements collects payment details. Recent fixes added regression coverage for checkout correctness and recoverable failures.

The product direction is a senior full-stack portfolio demo with a shopper journey and a future merchant order workflow. We need maintainable routing, a supported runtime, reproducible installation, and a place to add application APIs and server-side functionality incrementally.

## Decision

Use Next.js 16.4.3 with the App Router and React 19.3.1. Next.js builds on React; it supplies routing, rendering infrastructure, and future Route Handlers rather than replacing the React component model.

Pin Node.js 24.22.2 in `.nvmrc`, declare npm 11.19.1 as the package manager, use exact dependency versions, and retain one npm lockfile. Use `npm ci` for reproducible installation. Replace the legacy Material UI styling runtime with Material UI 9.5.0 `sx` styles and the documented App Router cache provider so server-rendered styles and browser hydration agree.

Preserve the existing checkout behavior and tests during the framework migration. The three storefront routes share a client commerce provider, which keeps cart state across navigation. The server-rendered layout supplies metadata and the application shell.

Keep Commerce.js 2.8 behind a small, lazy browser adapter for now. Importing a page on the server must not create browser cookies, call the provider, or require merchant configuration. Missing configuration produces a recoverable unavailable state; it does not imply that a demo purchase flow exists.

Use ESLint 10 with Next.js’s framework plugin, React Hooks checks, and JSX rules directly. The combined Next.js preset currently pulls legacy plugins whose peer ranges exclude ESLint 10. This keeps installation free of peer overrides while retaining explicit checks.

Upgrade the compatible Commerce.js SDK to 2.8.0 and override its Axios dependency to patched 0.34.0. Verify the SDK’s cart, shipping, tax, capture, and failure contracts against an injected HTTP adapter. This removes the known production dependency advisories without changing the provider integration model.

Use Jest with Next.js's test transformer for component and integration regressions, and Playwright against a production build for route, navigation, and hydration smoke checks. Run lint and verification explicitly in CI.

## Why this fits the project

Next.js gives the planned merchant workflow and application API a shared routing and deployment foundation. A lightweight client-only build tool would also support the existing storefront, but would leave a separate server framework decision for the next full-stack milestone.

The migration is deliberately incremental. Existing provider behavior remains observable through the regression suite while routing, rendering boundaries, dependencies, and delivery checks change. Server-side commerce can then be introduced with its own persistence, authorization, transaction semantics, and tests.

## Consequences and tradeoffs

- The repository now runs through Next.js development and production servers, with an explicit distinction between client components and server-capable routes.
- Product data and checkout remain client-side. This foundation does not yet provide server-rendered product content, an application database, merchant authentication, or application API endpoints.
- Commerce.js remains a legacy integration dependency. Its adapter isolates initialization, but replacing or upgrading its API behavior is a separate change.
- Public environment variables use the `NEXT_PUBLIC_*` prefix and are included in browser builds. Secret credentials belong in future server-only configuration.
- Framework migration requires compatible UI, form, payment, and test dependencies. The lockfile and regression checks make these changes reviewable and reproducible.
- Credential-free smoke checks validate startup, navigation, and unavailable states. A seeded demo and full browser purchase coverage remain the next milestone.
- No latency, SEO, or scalability improvement is claimed until measured for the relevant implemented feature.

## Verification

The foundation is accepted when `npm ci` works without legacy peer-dependency flags, `npm run check` succeeds, and production Playwright checks pass without merchant credentials. Existing capture, shipping, and address-restoration regressions must remain covered.

## References

- [Next.js installation and runtime requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js server and client components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Material UI with Next.js](https://mui.com/material-ui/integrations/nextjs/)
- [Jest with Next.js](https://nextjs.org/docs/app/guides/testing/jest)
