import MerchantOrderInbox from '../../../../components/Merchant/MerchantOrderInbox';
import MerchantSignOut from '../../../../components/Merchant/MerchantSignOut';
import MerchantGoogleConnection from '../../../../components/Merchant/MerchantGoogleConnection';
import { headers } from 'next/headers';
import { merchantSession } from '../../../../lib/merchant/server';

export const metadata = { title: 'Merchant orders' };
export default async function MerchantOrdersPage({ searchParams }) {
  const session = process.env.MERCHANT_GOOGLE_ENABLED === 'true' ? await merchantSession((await headers()).get('cookie')) : null;
  const authentication = session?.status === 200 ? session.data.authentication : null;
  const params = await searchParams;
  return <MerchantOrderInbox actions={<>
    <MerchantGoogleConnection enabled={authentication?.googleEnabled === true} linked={authentication?.googleLinked === true} failed={params?.authError === '1'} />
    <MerchantSignOut />
  </>} />;
}
