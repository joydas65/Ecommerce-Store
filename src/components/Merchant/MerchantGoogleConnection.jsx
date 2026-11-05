'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { merchantProviderUrl } from '../../lib/merchant/provider-url';

export default function MerchantGoogleConnection({ enabled, linked, failed = false }) {
  const activeRequest = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => activeRequest.current?.abort(), []);
  if (!enabled) return null;
  async function connect() {
    if (activeRequest.current || linked) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    let message = 'Google could not be connected. Please try again.';
    try {
      const response = await fetch('/api/auth/link-social', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal,
        body: JSON.stringify({ provider: 'google', callbackURL: '/admin/orders', errorCallbackURL: '/admin/sign-in' }) });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        message = [401, 403].includes(response.status) ? 'Sign in with your approved GitHub account before connecting Google.'
          : response.status === 429 ? 'Please wait a moment before trying again.' : message;
        throw new Error('Google connection unavailable');
      }
      const data = await response.json();
      if (controller.signal.aborted) return;
      const target = merchantProviderUrl(data.url, 'google');
      if (!target) throw new Error('Invalid provider destination');
      window.location.assign(target);
    } catch {
      if (controller.signal.aborted) return;
      setError(message); activeRequest.current = null; setBusy(false);
    }
  }
  return <div>
    {failed && <Alert severity="warning" sx={{ mb: 2 }}>Google connection was not completed. Your existing merchant access is available.</Alert>}
    {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
    {linked ? <span>Google connected</span> : <Button onClick={connect} disabled={busy} variant="outlined" startIcon={<GoogleIcon />}>
      {busy ? 'Opening Google…' : 'Connect Google'}
    </Button>}
  </div>;
}
