'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, TextField } from '@mui/material';
import { MerchantLoading, MerchantRequestState, MerchantWorkspace, PaymentBadge } from './MerchantWorkspace';
import { isMerchantOrderPage, merchantOrdersHref, MERCHANT_STATUS_OPTIONS, money, orderDate, providerLabel, readMerchantQuery } from './merchant-display';
import styles from './Merchant.module.css';

export default function MerchantOrderInbox({ actions, signInHref = '/admin/sign-in' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { status, cursor, valid } = readMerchantQuery(params);
  const href = merchantOrdersHref(status, cursor);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [previousPages, setPreviousPages] = useState({});
  const requestKey = `${href}:${attempt}`;
  const current = !valid ? { state: 'invalid' } : result?.key === requestKey ? result : { state: 'loading' };
  const filterLabel = MERCHANT_STATUS_OPTIONS.find((option) => option.value === status)?.label || 'All payments';

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    let active = true;
    async function loadOrders() {
      try {
        const query = new URLSearchParams({ status, limit: '20' });
        if (cursor) query.set('cursor', cursor);
        const response = await fetch(`/api/merchant/orders?${query}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!active) return;
        const failure = { 401: 'unauthorized', 403: 'forbidden', 400: 'invalid' }[response.status];
        if (failure) { setResult({ key: requestKey, state: failure }); return; }
        if (!response.ok) throw new Error('Merchant orders are unavailable.');
        const data = await response.json();
        if (!isMerchantOrderPage(data)) throw new Error('Order list could not be verified.');
        if (active) setResult({ key: requestKey, state: 'ready', data });
      } catch {
        if (active) setResult({ key: requestKey, state: 'error' });
      }
    }
    loadOrders();
    return () => { active = false; controller.abort(); };
  }, [status, cursor, valid, requestKey]);

  const changeFilter = (nextStatus) => router.push(merchantOrdersHref(nextStatus));
  const olderOrders = () => {
    const next = merchantOrdersHref(status, current.data.pageInfo.nextCursor);
    setPreviousPages((pages) => ({ ...pages, [next]: href }));
    router.push(next);
  };
  const previousHref = previousPages[href];
  const count = current.data?.orders.length || 0;

  return <MerchantWorkspace title="Orders" description="A clear view of every saved purchase and payment attempt. Review payment status, totals, and order details in one place." actions={actions}>
    <div className={styles.toolbar}>
      <TextField className={styles.filter} id="merchant-payment-status" label="Payment status" select size="small" value={valid ? status : 'all'}
        onChange={(event) => changeFilter(event.target.value)}
        slotProps={{ select: { native: true }, input: { sx: { bgcolor: 'background.paper', minHeight: 48 } } }}>
        {MERCHANT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </TextField>
      <div className={styles.toolbarMeta}>
        <span>Newest first · UTC</span>
        <Button onClick={() => setAttempt((value) => value + 1)} disabled={current.state === 'loading' || !valid} variant="outlined">Refresh orders</Button>
      </div>
    </div>
    {current.state === 'loading' ? <MerchantLoading />
      : current.state !== 'ready' ? <MerchantRequestState state={current.state} onRetry={() => setAttempt((value) => value + 1)} signInHref={signInHref} />
        : <>
          {count === 0 ? <section className={styles.statePanel} aria-labelledby="empty-orders-title">
            <h2 id="empty-orders-title">{cursor ? 'No orders on this page' : status === 'all' ? 'Your order inbox is ready' : status === 'review' ? 'No orders need review' : `No ${filterLabel.toLowerCase()} orders`}</h2>
            <p>{cursor ? 'Orders may have changed or reached their retention period. Return to the newest orders.' : status === 'all'
              ? 'Saved purchases and payment attempts will appear here after checkout. Start a test purchase to see the full journey.'
              : 'There are no saved orders with this payment status. Choose another filter or view all payments.'}</p>
            {cursor ? <Button component={Link} href={merchantOrdersHref(status)} variant="outlined">Newest orders</Button>
              : status !== 'all' ? <Button onClick={() => changeFilter('all')} variant="outlined">View all payments</Button>
                : <Button component={Link} href="/" variant="outlined">Browse the storefront</Button>}
          </section> : <div className={styles.tablePanel}>
            <table className={styles.ordersTable} aria-label="Merchant orders">
              <thead><tr><th scope="col" className={styles.orderColumn}>Order</th><th scope="col">Payment</th><th scope="col">Provider</th><th scope="col">Placed</th><th scope="col" className={styles.totalColumn}>Total</th></tr></thead>
              <tbody>{current.data.orders.map((order) => <tr key={order.id}>
                <td className={styles.orderColumn}>
                  <Link className={styles.reference} href={`/admin/orders/${encodeURIComponent(order.id)}`} title={order.reference}>{order.reference}</Link>
                  <div className={styles.secondary}>{order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}</div>
                </td>
                <td><span className={styles.mobileLabel} aria-hidden="true">Payment</span><PaymentBadge order={order} /></td>
                <td><span className={styles.mobileLabel} aria-hidden="true">Provider</span>{providerLabel(order)}</td>
                <td><span className={styles.mobileLabel} aria-hidden="true">Placed</span><time className={styles.date} dateTime={order.createdAt}>{orderDate(order.createdAt)}</time></td>
                <td className={styles.totalColumn}><span className={styles.mobileLabel} aria-hidden="true">Total</span>{money(order.totalCents)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className={styles.pagination}>
            <p className={styles.paginationInfo} role="status">{count} {count === 1 ? 'order' : 'orders'} on this page{status !== 'all' ? ` · ${filterLabel}` : ''}</p>
            <nav className={styles.pageButtons} aria-label="Order pages">
              {cursor && <Button variant="outlined" onClick={() => router.push(previousHref || merchantOrdersHref(status))}>{previousHref ? 'Newer orders' : 'Newest orders'}</Button>}
              {count > 0 && <Button variant="outlined" onClick={olderOrders} disabled={!current.data.pageInfo.hasMore}>Older orders</Button>}
            </nav>
          </div>
        </>}
    <p className={styles.detailFootnote}>Payment statuses reflect the latest saved result. Open an unresolved Stripe order to recheck its payment status and review merchant activity.</p>
  </MerchantWorkspace>;
}
