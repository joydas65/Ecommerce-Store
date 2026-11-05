import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import MerchantSignIn from '../../../components/Merchant/MerchantSignIn';
import { merchantConfig, merchantSession } from '../../../lib/merchant/server';

export const metadata = { title: 'Merchant sign in' };
export default async function SignInPage({ searchParams }) {
  let available = false;
  try { merchantConfig(); available = true; } catch { /* Show the environment's unavailable state. */ }
  const session = available ? await merchantSession((await headers()).get('cookie')) : { status: 503 };
  const params = await searchParams;
  if (session.status === 200) redirect(params?.error ? '/admin/orders?authError=1' : '/admin/orders');
  return <MerchantSignIn available={available} googleEnabled={process.env.MERCHANT_GOOGLE_ENABLED === 'true'} failed={Boolean(params?.error)} forbidden={session.status === 403} />;
}
