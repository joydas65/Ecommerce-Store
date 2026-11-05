'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@mui/material';
import AccountWorkspace, { AccountLoading, AccountPaymentBadge, AccountState } from './AccountWorkspace';
import { customerOrderId, isCustomerReceipt, money, orderDate, paymentLabel } from './account-display';
import useCustomerResource from './useCustomerResource';
import styles from './Account.module.css';

export default function CustomerOrderDetail({ orderId }) {
  const validate = useCallback((value) => isCustomerReceipt(value, orderId), [orderId]);
  const result = useCustomerResource(`/api/customer/orders/${encodeURIComponent(orderId)}`, validate, customerOrderId.test(orderId));
  const order = result.data;
  const unresolved = ['PENDING', 'REQUIRES_REVIEW'].includes(order?.paymentStatus);
  return <AccountWorkspace title="Your receipt" description="The items, totals, and latest saved payment status for this purchase.">
    <div className={styles.toolbar}><Link href="/account">← Back to my orders</Link>
      <Button variant="outlined" disabled={result.state === 'loading'} onClick={result.retry}>Refresh receipt</Button></div>
    {result.state === 'loading' ? <AccountLoading detail /> : result.state !== 'ready' ? <AccountState state={result.state} onRetry={result.retry} /> : <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="customer-items-title"><h2 id="customer-items-title">Items & totals</h2>
        <ul className={styles.items} aria-label="Your purchased items">{order.items.map((item) => <li className={styles.item} key={item.productId}>
          <div><p>{item.name}</p><span className={styles.meta}>Quantity {item.quantity} · {money(item.unitPriceCents)} each</span></div><span>{money(item.lineTotalCents)}</span>
        </li>)}</ul>
        <dl className={styles.totals} aria-label="Your order totals">{[
          ['Subtotal', order.subtotalCents], [order.shippingMethod === 'demo-standard' ? 'Standard shipping' : 'Express shipping', order.shippingCents],
          ['Sample tax (8%)', order.taxCents], ['Total (USD)', order.totalCents],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
        <p className={styles.footnote}>Sample tax applies to products and shipping. These amounts were saved at checkout.</p>
      </section>
      <section className={styles.panel} aria-labelledby="customer-payment-title"><h2 id="customer-payment-title">Payment & receipt</h2>
        <AccountPaymentBadge order={order} /><p className={styles.meta}>{paymentLabel(order).description}</p>
        <dl className={styles.details}>
          <div><dt>Order reference</dt><dd>{order.reference}</dd></div>
          <div><dt>Placed</dt><dd><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time></dd></div>
          <div><dt>Receipt availability</dt><dd>{unresolved ? 'Kept while this payment is unresolved.' : <>Until <time dateTime={order.expiresAt}>{orderDate(order.expiresAt)}</time>.</>}</dd></div>
        </dl>
        <p className={styles.footnote}>This is a test purchase. No real money is charged and nothing is shipped.</p>
      </section>
    </div>}
  </AccountWorkspace>;
}
