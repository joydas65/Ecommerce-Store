import { forwardOrderRequest } from '../../../../../lib/orders/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^order_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    return Response.json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return forwardOrderRequest(request, `/v1/orders/${id}`);
}
