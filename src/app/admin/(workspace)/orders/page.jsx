import MerchantOrderInbox from '../../../../components/Merchant/MerchantOrderInbox';
import MerchantSignOut from '../../../../components/Merchant/MerchantSignOut';

export const metadata = { title: 'Merchant orders' };
export default function MerchantOrdersPage() { return <MerchantOrderInbox actions={<MerchantSignOut />} />; }
