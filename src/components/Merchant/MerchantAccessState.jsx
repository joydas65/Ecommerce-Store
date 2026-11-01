'use client';

import { useRouter } from 'next/navigation';
import { MerchantRequestState, MerchantWorkspace } from './MerchantWorkspace';
import MerchantSignOut from './MerchantSignOut';

export default function MerchantAccessState({ forbidden = false }) {
  const router = useRouter();
  return <MerchantWorkspace title="Merchant orders" description="Review payments and saved order details." actions={<MerchantSignOut />}>
    <MerchantRequestState state={forbidden ? 'forbidden' : 'error'} onRetry={() => router.refresh()} />
  </MerchantWorkspace>;
}
