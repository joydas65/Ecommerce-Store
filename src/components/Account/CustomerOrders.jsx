'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@mui/material';
import AccountWorkspace, { AccountLoading, AccountPaymentBadge, AccountState } from './AccountWorkspace';
import { isCustomerOrderPage, money, orderDate, ordersHref } from './account-display';
import useCustomerResource from './useCustomerResource';
import styles from './Account.module.css';

export default function CustomerOrders() {
  const router = useRouter();
  const params = useSearchParams();
  const cursor = params.get('cursor') || '';
  const valid = [...params.keys()].every((key) => key === 'cursor') && params.getAll('cursor').length <= 1
    && (!cursor || /^[A-Za-z0-9_-]{1,512}$/.test(cursor));
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  const result = useCustomerResource(`/api/customer/orders?${query}`, isCustomerOrderPage, valid);
  const [previousPages, setPreviousPages] = useState({});
  const href = ordersHref(cursor);
  function olderOrders() {
    const next = ordersHref(result.data.pageInfo.nextCursor);
    setPreviousPages((pages) => ({ ...pages, [next]: href }));
    router.push(next);
  }
  const count = result.data?.orders.length || 0;
  return <AccountWorkspace title="My orders" description="Your saved purchases, payment status, and receipts. Orders placed while signed in appear here across your devices.">
    <div className={styles.toolbar}><span>Newest first · UTC</span><Button variant="outlined" disabled={result.state === 'loading' || !valid} onClick={result.retry}>Refresh orders</Button></div>
    {result.state === 'loading' ? <AccountLoading /> : result.state !== 'ready' ? <AccountState state={result.state} onRetry={result.retry} /> : <>
      {count === 0 ? <section className={styles.state} aria-labelledby="customer-empty-title">
        <h2 id="customer-empty-title">{cursor ? 'No orders on this page' : 'Your next purchase starts here'}</h2>
        <p>{cursor ? 'Older orders may have reached their retention period. Open your newest orders to continue.'
          : 'Shop while signed in and your new orders will appear here. Earlier guest purchases remain in the browser where you placed them.'}</p>
        <Button component={Link} href={cursor ? '/account' : '/'} variant="contained">{cursor ? 'Newest orders' : 'Explore the collection'}</Button>
      </section> : <ul className={styles.orders} aria-label="Your orders">
        {result.data.orders.map((order) => <li className={styles.panel} key={order.id}>
          <div className={styles.orderHead}>
            <div><Link className={styles.reference} href={`/account/orders/${encodeURIComponent(order.id)}`}>{order.reference}</Link>
              <p><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time></p></div>
            <span className={styles.amount}>{money(order.totalCents)}</span>
          </div>
          <div className={styles.orderBody}><AccountPaymentBadge order={order} /><span className={styles.meta}>{order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}</span>
            <Link href={`/account/orders/${encodeURIComponent(order.id)}`} aria-label={`View receipt ${order.reference}`}>View receipt →</Link></div>
        </li>)}
      </ul>}
      <div className={styles.pagination}><p role="status" className={styles.meta}>{count} {count === 1 ? 'order' : 'orders'} on this page</p>
        <nav aria-label="Your order pages">{cursor && <Button variant="outlined" onClick={() => router.push(previousPages[href] || '/account')}>{previousPages[href] ? 'Newer orders' : 'Newest orders'}</Button>}
          {count > 0 && <Button variant="outlined" disabled={!result.data.pageInfo.hasMore} onClick={olderOrders}>Older orders</Button>}</nav>
      </div>
    </>}
    <p className={styles.footnote}>Receipts are available for 30 days after purchase or payment resolution. Unresolved Stripe test orders remain available until resolved. All purchases in this store are tests; nothing is shipped.</p>
  </AccountWorkspace>;
}
