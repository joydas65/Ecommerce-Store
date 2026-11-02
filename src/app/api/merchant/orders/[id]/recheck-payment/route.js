import { forwardMerchantPaymentCheck } from '../../../../../../lib/merchant/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request, { params }) {
  const { id } = await params;
  return forwardMerchantPaymentCheck(request, id);
}
