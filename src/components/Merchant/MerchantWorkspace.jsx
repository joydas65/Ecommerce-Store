import Link from 'next/link';
import { Button, CircularProgress } from '@mui/material';
import { paymentLabel } from './merchant-display';
import styles from './Merchant.module.css';

export function MerchantWorkspace({ title, description, actions, children }) {
  return <main className={styles.workspace}>
    <div className={styles.topline}>
      <p className={styles.eyebrow}>Joy’s Store / Merchant workspace</p>
      <div className={styles.access}><span className={styles.accessBadge}>Merchant access</span>{actions}</div>
    </div>
    <h1 className={styles.heading}>{title}</h1>
    <p className={styles.intro}>{description}</p>
    <div className={styles.notice} role="note"><strong>Test purchases only.</strong><span>Stripe sandbox and simulated orders. No real money is charged or goods shipped.</span></div>
    {children}
  </main>;
}

export function PaymentBadge({ order }) {
  const payment = paymentLabel(order);
  return <span className={`${styles.badge} ${styles[payment.tone]}`}>{payment.label}</span>;
}

export function MerchantLoading({ detail = false }) {
  return <div className={styles.statePanel}>
    <div className={styles.loading} role="status">
      <CircularProgress size={24} aria-hidden="true" />
      <span>{detail ? 'Loading order details…' : 'Loading orders…'}</span>
    </div>
  </div>;
}

export function MerchantRequestState({ state, onRetry, signInHref = '/admin/sign-in', detail = false }) {
  const states = {
    unauthorized: { title: 'Sign in to continue', text: 'Your merchant session is missing or has expired. Sign in again to view orders.' },
    forbidden: { title: 'Merchant access required', text: 'This account does not have permission to view store orders. Contact the store owner if you need access.' },
    invalid: { title: 'This order view is unavailable', text: 'The filter or page link is not valid. Open the newest orders to continue.' },
    missing: { title: 'Order not found', text: 'This order is unavailable or its retention period has ended. Return to the inbox to find available orders.' },
    error: { title: detail ? 'Order details unavailable' : 'Orders temporarily unavailable', text: 'We could not load the latest order information. Please try again.' },
  };
  const message = states[state] || states.error;
  return <section className={styles.statePanel} aria-labelledby="merchant-state-title">
    <h2 id="merchant-state-title">{message.title}</h2>
    <p>{message.text}</p>
    {state === 'unauthorized' ? <Button component={Link} href={signInHref} variant="contained">Merchant sign in</Button>
      : state === 'invalid' || state === 'missing' ? <Button component={Link} href="/admin/orders" variant="outlined">Back to orders</Button>
        : state === 'forbidden' ? <Button component={Link} href="/" variant="outlined">Back to store</Button>
          : <Button onClick={onRetry} variant="contained">Retry</Button>}
  </section>;
}
