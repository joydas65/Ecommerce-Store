import { forwardMerchantRequest, merchantError } from '../../../../../lib/merchant/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) return merchantError(404);
  if (new URL(request.url).search) return merchantError(400);
  return forwardMerchantRequest(request, `/v1/merchant/orders/${id}`);
}
