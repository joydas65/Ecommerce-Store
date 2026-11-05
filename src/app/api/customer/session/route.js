import { customerError, forwardCustomerRequest } from '../../../../lib/customer/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  if (new URL(request.url).search) return customerError(400);
  return forwardCustomerRequest(request, '/v1/customer/session');
}
