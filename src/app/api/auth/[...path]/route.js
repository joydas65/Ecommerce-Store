import { forwardMerchantAuth } from '../../../../lib/merchant/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function handle(request, { params }) {
  const { path } = await params;
  return forwardMerchantAuth(request, path.join('/'));
}
export { handle as GET, handle as POST };
