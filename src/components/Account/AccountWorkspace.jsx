'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, CircularProgress } from '@mui/material';
import { paymentLabel } from './account-display';
import styles from './Account.module.css';

export function AccountState({ state, onRetry }) {
  const messages = {
    unauthorized: ['Sign in to continue', 'Your session is missing or has expired. Sign in again to view your orders.'],
    missing: ['Order not found', 'This order is unavailable in your account or its retention period has ended.'],
    invalid: ['This order page is unavailable', 'Open your newest orders to continue.'],
    error: ['Your account is temporarily unavailable', 'We could not load the latest order information. Please try again.'],
  };
  const [title, text] = messages[state] || messages.error;
  return <section className={styles.state} aria-labelledby="account-state-title">
    <h2 id="account-state-title">{title}</h2><p>{text}</p>
    {state === 'unauthorized' ? <Button component={Link} href="/account/sign-in" variant="contained">Sign in with Google</Button>
      : ['missing', 'invalid'].includes(state) ? <Button component={Link} href="/account" variant="outlined">Back to my orders</Button>
        : <Button onClick={onRetry} variant="contained">Try again</Button>}
  </section>;
}

export function AccountLoading({ detail = false }) {
  return <div className={styles.state}><div className={styles.loading} role="status"><CircularProgress size={24} aria-hidden="true" />
    <span>{detail ? 'Loading your receipt…' : 'Loading your orders…'}</span></div></div>;
}

export function AccountPaymentBadge({ order }) {
  const payment = paymentLabel(order);
  return <span className={`${styles.badge} ${styles[payment.tone] || ''}`}>{payment.label}</span>;
}

export default function AccountWorkspace({ title, description, children }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState(false);
  const signingOut = useRef(null);
  useEffect(() => () => signingOut.current?.abort(), []);
  async function signOut() {
    if (signingOut.current) return;
    const controller = new AbortController();
    signingOut.current = controller;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/customer-auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: '{}', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error('Sign-out unavailable');
      setSignedOut(true);
      router.replace('/account/sign-in');
      router.refresh();
    } catch {
      if (controller.signal.aborted) return;
      setError(true); setBusy(false); signingOut.current = null;
    }
  }
  return <main className={styles.workspace}>
    <div className={styles.topline}><p className={styles.eyebrow}>Joy’s Store / Your account</p>
      {!signedOut && <Button onClick={signOut} disabled={busy} variant="text">{busy ? 'Signing out…' : 'Sign out'}</Button>}</div>
    <h1 className={styles.heading}>{title}</h1><p className={styles.intro}>{description}</p>
    {error && <Alert severity="error" sx={{ mb: 3 }}>Could not sign out. Please try again.</Alert>}
    {signedOut ? <AccountState state="unauthorized" /> : children}
  </main>;
}
