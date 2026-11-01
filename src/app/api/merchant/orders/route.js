import { forwardMerchantRequest } from '../../../../lib/merchant/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  return forwardMerchantRequest(request, `/v1/merchant/orders${new URL(request.url).search}`);
}
