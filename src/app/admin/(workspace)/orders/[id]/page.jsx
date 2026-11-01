import MerchantOrderDetail from '../../../../../components/Merchant/MerchantOrderDetail';
import MerchantSignOut from '../../../../../components/Merchant/MerchantSignOut';

export const metadata = { title: 'Merchant order details' };
export default async function MerchantOrderPage({ params }) {
  const { id } = await params;
  return <MerchantOrderDetail orderId={id} actions={<MerchantSignOut />} />;
}
