import { forwardCustomerRequest } from '../../../../lib/customer/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  return forwardCustomerRequest(request, `/v1/customer/orders${new URL(request.url).search}`);
}
