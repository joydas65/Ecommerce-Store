import { forwardMerchantRequest, merchantError } from '../../../../lib/merchant/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  if (new URL(request.url).search) return merchantError(400);
  return forwardMerchantRequest(request, '/v1/merchant/session');
}
