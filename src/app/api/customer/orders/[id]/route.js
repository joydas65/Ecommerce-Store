import { customerError, forwardCustomerRequest } from '../../../../../lib/customer/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) return customerError(404);
  if (new URL(request.url).search) return customerError(400);
  return forwardCustomerRequest(request, `/v1/customer/orders/${id}`);
}
