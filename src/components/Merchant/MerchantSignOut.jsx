'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button } from '@mui/material';

export default function MerchantSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      if (!response.ok) throw new Error('Sign out unavailable');
      router.replace('/admin/sign-in');
      router.refresh();
    } catch { setFailed(true); setBusy(false); }
  }
  return <Box>
    <Button size="small" variant="outlined" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</Button>
    {failed && <Alert severity="error" sx={{ mt: 1 }}>Could not sign out. Please try again.</Alert>}
  </Box>;
}
