'use client';

import { useRef, useState } from 'react';
import { Alert, Box, Button, Divider, Typography } from '@mui/material';
import Review from './Review';

export default function HostedStripePaymentForm({ checkoutToken, backStep, onStartPayment, onComplete, reviewHeadingRef }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);

  const submit = async (event) => {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setSubmitting(true);
    setError('');
    try {
      const confirmed = await onStartPayment(checkoutToken.id);
      // Normally the browser redirects. A replay can return an already verified
      // receipt; a Checkout Session itself never becomes a confirmation.
      if (confirmed) {
        if (confirmed.status_payment !== 'paid' || confirmed.payment_provider !== 'stripe-test'
          || confirmed.payment_mode !== 'test' || confirmed.persistent !== true || typeof confirmed.id !== 'string') {
          throw new Error('Payment has not been confirmed. Resume the saved checkout to check its status.');
        }
        onComplete(confirmed);
      }
    } catch (failure) {
      setError(failure?.message || 'Stripe checkout could not be started. Please try again.');
      locked.current = false;
      setSubmitting(false);
    }
  };

  return <>
    <Review checkoutToken={checkoutToken} headingRef={reviewHeadingRef} />
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Sample totals include an illustrative 8% tax on products and shipping.</Typography>
    <Divider />
    <Typography component="h2" variant="h6" sx={{ mt: 2.5, mb: 1 }}>Stripe test checkout</Typography>
    <Typography sx={{ mb: 2 }}>Continue to Stripe to use a test card. No real money is charged and nothing will be shipped.</Typography>
    <Typography component="p" role="note" variant="body2" sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
      Test card: <Box component="code" sx={{ whiteSpace: 'nowrap' }}>4242 4242 4242 4242</Box>. Use any future expiry and any three-digit CVC.
    </Typography>
    <form onSubmit={submit} aria-busy={submitting}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={backStep} disabled={submitting}>Back</Button>
        <Button type="submit" variant="contained" disabled={submitting}>{submitting ? 'Opening Stripe checkout…' : 'Continue to Stripe test checkout'}</Button>
      </Box>
    </form>
  </>;
}
