import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerAccessState from '../../../components/Account/CustomerAccessState';
import { customerConfig, customerSession } from '../../../lib/customer/server';

export default async function PrivateAccountLayout({ children }) {
  let configured = false;
  try { customerConfig(); configured = true; } catch { /* Unconfigured environments show sign-in availability. */ }
  if (!configured) redirect('/account/sign-in');
  const session = await customerSession((await headers()).get('cookie'));
  if ([401, 403].includes(session.status)) redirect('/account/sign-in');
  if (session.status !== 200) return <CustomerAccessState />;
  return children;
}
