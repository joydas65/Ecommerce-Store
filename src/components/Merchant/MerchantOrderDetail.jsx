'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@mui/material';
import { isSimulatedOrderReceipt, isStripeOrder } from '../../lib/orders/order-contract';
import { MerchantLoading, MerchantRequestState, MerchantWorkspace, PaymentBadge } from './MerchantWorkspace';
import { money, orderDate, paymentLabel, providerLabel } from './merchant-display';
import styles from './Merchant.module.css';

export default function MerchantOrderDetail({ orderId, actions, signInHref = '/admin/sign-in' }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestKey = `${orderId}:${attempt}`;
  const current = result?.key === requestKey ? result : { state: 'loading' };
  const order = current.order;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadOrder() {
      try {
        const response = await fetch(`/api/merchant/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!active) return;
        const failure = { 401: 'unauthorized', 403: 'forbidden', 404: 'missing', 400: 'missing' }[response.status];
        if (failure) { setResult({ key: requestKey, state: failure }); return; }
        if (!response.ok) throw new Error('Merchant order is unavailable.');
        const data = await response.json();
        if (!isSimulatedOrderReceipt(data, orderId) && !isStripeOrder(data, orderId)) throw new Error('Order details could not be verified.');
        if (active) setResult({ key: requestKey, state: 'ready', order: data });
      } catch {
        if (active) setResult({ key: requestKey, state: 'error' });
      }
    }
    loadOrder();
    return () => { active = false; controller.abort(); };
  }, [orderId, requestKey]);

  const unresolved = order?.paymentStatus === 'PENDING' || order?.paymentStatus === 'REQUIRES_REVIEW';

  return <MerchantWorkspace title="Order details" description="The saved order, its payment result, and a complete breakdown of the purchase." actions={actions}>
    <div className={styles.toolbar}>
      <Link className={styles.back} href="/admin/orders">← Back to orders</Link>
      <Button variant="outlined" disabled={current.state === 'loading'} onClick={() => setAttempt((value) => value + 1)}>Refresh order</Button>
    </div>
    {current.state === 'loading' ? <MerchantLoading detail />
      : current.state !== 'ready' ? <MerchantRequestState state={current.state} detail onRetry={() => setAttempt((value) => value + 1)} signInHref={signInHref} />
        : <>
          <div className={styles.detailGrid}>
            <section className={styles.panel} aria-labelledby="merchant-order-items-title">
              <h2 id="merchant-order-items-title">Items & totals</h2>
              <ul className={styles.items} aria-label="Order items">
                {order.items.map((item) => <li className={styles.item} key={item.productId}>
                  <div><p className={styles.itemName}>{item.name}</p><div className={styles.secondary}>Quantity {item.quantity} · {money(item.unitPriceCents)} each</div></div>
                  <span className={styles.itemAmount}>{money(item.lineTotalCents)}</span>
                </li>)}
              </ul>
              <dl className={styles.totals} aria-label="Order totals">
                {[
                  ['Subtotal', order.subtotalCents],
                  [order.shippingMethod === 'demo-standard' ? 'Standard shipping' : 'Express shipping', order.shippingCents],
                  ['Sample tax (8%)', order.taxCents],
                  ['Total (USD)', order.totalCents],
                ].map(([label, value]) => <div className={styles.totalsRow} key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}
              </dl>
              <p className={styles.detailFootnote}>Sample tax applies to products and shipping. These are the amounts saved at checkout.</p>
            </section>
            <section className={styles.panel} aria-labelledby="merchant-order-payment-title">
              <div className={styles.detailHeader}><h2 id="merchant-order-payment-title">Payment & record</h2><PaymentBadge order={order} /></div>
              <dl className={styles.details}>
                <div><dt>Order reference</dt><dd>{order.reference}</dd></div>
                <div><dt>Payment provider</dt><dd>{providerLabel(order)}</dd></div>
                <div><dt>Placed</dt><dd><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time></dd></div>
                <div><dt>Retention</dt><dd>{unresolved ? 'Kept while this payment is unresolved.' : <>Available until <time dateTime={order.expiresAt}>{orderDate(order.expiresAt)}</time>.</>}</dd></div>
              </dl>
              <p className={styles.statusDescription}>{paymentLabel(order).detail}</p>
            </section>
          </div>
          <p className={styles.detailFootnote}>Read-only record. Payment and fulfillment actions are not available in this workspace.</p>
        </>}
  </MerchantWorkspace>;
}
