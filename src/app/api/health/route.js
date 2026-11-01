import { isDemoMode, isPersistentDemo } from '../../../lib/commerce-mode';

export const dynamic = 'force-dynamic';

// Public release identity only. Never expose environment values or credentials.
export function GET() {
  return Response.json({
    status: 'ok',
    mode: isDemoMode ? 'demo' : 'live',
    orderStorage: isPersistentDemo ? 'remote' : 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
