import { isDemoMode } from '../../../lib/commerce-mode';

export const dynamic = 'force-dynamic';

// Public release identity only. Never expose environment values or credentials.
export function GET() {
  return Response.json({
    status: 'ok',
    mode: isDemoMode ? 'demo' : 'live',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
