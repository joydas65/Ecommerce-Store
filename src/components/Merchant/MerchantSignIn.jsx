'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import GoogleIcon from '@mui/icons-material/Google';
import { merchantProviderUrl } from '../../lib/merchant/provider-url';

export default function MerchantSignIn({ available, googleEnabled = false, failed = false, forbidden = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const activeRequest = useRef(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  async function signIn(provider) {
    if (activeRequest.current || !available || !['github', ...(googleEnabled ? ['google'] : [])].includes(provider)) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(provider);
    setError('');
    let message = 'Sign-in is temporarily unavailable. Please try again.';
    try {
      const response = await fetch('/api/auth/sign-in/social', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' }), cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 429) message = 'Please wait a moment before trying to sign in again.';
        throw new Error('Sign-in unavailable');
      }
      const data = await response.json();
      if (controller.signal.aborted) return;
      const target = merchantProviderUrl(data.url, provider);
      if (!target) throw new Error('Sign-in is temporarily unavailable. Please try again.');
      window.location.assign(target);
    } catch {
      if (controller.signal.aborted) return;
      setError(message); setBusy(''); activeRequest.current = null;
    }
  }
  return <Box component="main" sx={{ maxWidth: 560, mx: 'auto', px: 3, py: { xs: 5, sm: 9 } }}>
    <Typography component="p" sx={{ textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 11, fontWeight: 700, color: 'primary.main', mb: 2 }}>Joy&apos;s Store / Merchant workspace</Typography>
    <Typography component="h1" variant="h2" sx={{ fontSize: { xs: 38, sm: 48 }, mb: 2 }}>A clear view of every order.</Typography>
    <Typography color="text.secondary" sx={{ mb: 4 }}>Sign in to review payments, shipping totals, and saved order details. Access is reserved for approved merchant accounts.</Typography>
    <Paper variant="outlined" sx={{ p: 3 }}>
      {!available ? <Alert severity="info">Merchant sign-in is not configured in this environment. The public storefront remains available.</Alert> : <>
        {(failed || forbidden) && <Alert severity="warning" sx={{ mb: 2 }}>{forbidden ? 'This account does not have merchant access.' : 'Sign-in was not completed. Try again with an approved merchant account.'}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Button onClick={() => signIn('github')} disabled={Boolean(busy)} fullWidth variant="contained" startIcon={<GitHubIcon />}>
          {busy === 'github' ? 'Opening GitHub…' : 'Sign in with GitHub'}
        </Button>
        {googleEnabled && <>
          <Button onClick={() => signIn('google')} disabled={Boolean(busy)} fullWidth variant="outlined" startIcon={<GoogleIcon />} sx={{ mt: 2 }}>
            {busy === 'google' ? 'Opening Google…' : 'Sign in with Google'}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>First time using Google here? Sign in with GitHub, then connect Google from your merchant workspace.</Typography>
        </>}
      </>}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Review orders and recheck unresolved Stripe test payments. Each merchant check is recorded in the order history.</Typography>
    </Paper>
    <Button component={Link} href="/" sx={{ mt: 2 }}>Back to storefront</Button>
  </Box>;
}
