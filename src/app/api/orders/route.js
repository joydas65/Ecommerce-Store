import { forwardOrderRequest } from '../../../lib/orders/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const POST = (request) => forwardOrderRequest(request, '/v1/orders');
