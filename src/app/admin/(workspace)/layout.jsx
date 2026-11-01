import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import MerchantAccessState from '../../../components/Merchant/MerchantAccessState';
import { merchantConfig, merchantSession } from '../../../lib/merchant/server';

export default async function ProtectedMerchantLayout({ children }) {
  let configured = false;
  try { merchantConfig(); configured = true; } catch { /* Disabled previews use the sign-in availability page. */ }
  if (!configured) redirect('/admin/sign-in');
  const session = await merchantSession((await headers()).get('cookie'));
  if (session.status === 401) redirect('/admin/sign-in');
  if (session.status !== 200) return <MerchantAccessState forbidden={session.status === 403} />;
  return children;
}
