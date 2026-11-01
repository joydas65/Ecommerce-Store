'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';

export default function MerchantSignIn({ available, failed = false, forbidden = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signIn() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/sign-in/social', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'github', callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' }), cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 429 ? 'Please wait a moment before trying to sign in again.' : 'Sign-in is temporarily unavailable. Please try again.');
      const data = await response.json();
      const target = new URL(data.url);
      if (target.origin !== 'https://github.com' || target.pathname !== '/login/oauth/authorize' || target.username || target.password) throw new Error('Sign-in is temporarily unavailable. Please try again.');
      window.location.assign(target.href);
    } catch (failure) { setError(failure.message || 'Sign-in is temporarily unavailable. Please try again.'); setBusy(false); }
  }
  return <Box component="main" sx={{ maxWidth: 560, mx: 'auto', px: 3, py: { xs: 5, sm: 9 } }}>
    <Typography component="p" sx={{ textTransform: 'uppercase', letterSpacing: '.18em', fontSize: 11, fontWeight: 700, color: 'primary.main', mb: 2 }}>Joy&apos;s Store / Merchant workspace</Typography>
    <Typography component="h1" variant="h2" sx={{ fontSize: { xs: 38, sm: 48 }, mb: 2 }}>A clear view of every order.</Typography>
    <Typography color="text.secondary" sx={{ mb: 4 }}>Sign in to review payments, shipping totals, and saved order details. Access is reserved for approved merchant accounts.</Typography>
    <Paper variant="outlined" sx={{ p: 3 }}>
      {!available ? <Alert severity="info">Merchant sign-in is not configured in this environment. The public storefront remains available.</Alert> : <>
        {(failed || forbidden) && <Alert severity="warning" sx={{ mb: 2 }}>{forbidden ? 'This GitHub account does not have merchant access.' : 'Sign-in was not completed. Try again with an approved GitHub account.'}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Button onClick={signIn} disabled={busy} fullWidth variant="contained" startIcon={<GitHubIcon />}>
          {busy ? 'Opening GitHub…' : 'Sign in with GitHub'}
        </Button>
      </>}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Read-only order access. This store contains Stripe test payments and simulated purchases.</Typography>
    </Paper>
    <Button component={Link} href="/" sx={{ mt: 2 }}>Back to storefront</Button>
  </Box>;
}
