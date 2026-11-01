import { catalogProvider, paymentProvider, orderStorage, usesSimulatedPayment, usesPersistentOrders } from '../../../lib/storefront-config';

export const dynamic = 'force-dynamic';

// Public release identity only. Never expose environment values or credentials.
export function GET() {
  return Response.json({
    status: 'ok',
    // Retain the release-gate fields for deployments using the previous harness.
    mode: usesSimulatedPayment ? 'demo' : 'live',
    orderStorage: usesPersistentOrders ? 'remote' : 'local',
    providers: { catalog: catalogProvider, payment: paymentProvider, orders: orderStorage },
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
