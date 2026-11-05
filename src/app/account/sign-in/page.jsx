import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerSignIn from '../../../components/Account/CustomerSignIn';
import { customerConfig, customerSession } from '../../../lib/customer/server';

export const metadata = { title: 'Sign in' };
export default async function CustomerSignInPage({ searchParams }) {
  let available = false;
  try { customerConfig(); available = true; } catch { /* Disabled environments keep guest checkout. */ }
  if (available && (await customerSession((await headers()).get('cookie'))).status === 200) redirect('/account');
  const params = await searchParams;
  return <CustomerSignIn available={available} failed={Boolean(params?.error)} />;
}
