'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Button } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { customerSignInBody, googleAuthorizationUrl } from '../../lib/customer/auth-contract';
import styles from './Account.module.css';

export default function CustomerSignIn({ available, failed = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  async function signIn() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true); setError('');
    let message = 'Sign-in is temporarily unavailable. Please try again.';
    try {
      const response = await fetch('/api/customer-auth/sign-in/social', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerSignInBody), cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) {
        if (response.status === 429) message = 'Please wait a moment before trying again.';
        throw new Error('Sign-in unavailable');
      }
      const data = await response.json();
      if (controller.signal.aborted) return;
      const target = googleAuthorizationUrl(data.url);
      if (!target) throw new Error('Sign-in is temporarily unavailable. Please try again.');
      window.location.assign(target);
    } catch {
      if (controller.signal.aborted) return;
      setError(message);
      activeRequest.current = null; setBusy(false);
    }
  }
  return <main className={`${styles.workspace} ${styles.signIn}`}>
    <p className={styles.eyebrow}>Joy’s Store / Your account</p>
    <h1 className={styles.heading} style={{ marginTop: 22 }}>Your purchases, in one place.</h1>
    <p className={styles.intro}>Sign in to keep new purchases in your account and view your receipts across devices.</p>
    <section className={styles.panel} aria-label="Customer sign in">
      {!available ? <Alert severity="info">Account sign-in is not configured in this environment. You can continue shopping as a guest.</Alert> : <>
        {failed && <Alert severity="warning" sx={{ mb: 2 }}>Sign-in was not completed. Try again with your Google account.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Button variant="outlined" fullWidth disabled={busy} onClick={signIn} sx={{ bgcolor: 'white', color: '#1f1f1f', borderColor: '#747775', minHeight: 44 }}
          startIcon={<GoogleIcon aria-hidden="true" />}>
          {busy ? 'Opening Google…' : 'Sign in with Google'}
        </Button>
      </>}
      <p className={styles.footnote}>Guest checkout is always available. Earlier guest purchases stay with the browser used at checkout and are not added to your account.</p>
    </section>
    <Button component={Link} href="/" sx={{ mt: 2 }}>Continue shopping</Button>
  </main>;
}
