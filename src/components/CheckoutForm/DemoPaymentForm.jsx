'use client';

import { useRef, useState } from 'react';
import { Box, Typography, Button, Checkbox, Divider, FormControlLabel } from '@mui/material';
import Review from './Review';
import { createOrderData } from './orderData';

export default function DemoPaymentForm({ checkoutToken, backStep, shippingData, onCaptureCheckout, onComplete, reviewHeadingRef }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failOnce, setFailOnce] = useState(false);
  const submitting = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const order = await onCaptureCheckout(checkoutToken.id, createOrderData(checkoutToken, shippingData, {
        gateway: 'demo', demo: { failOnce },
      }));
      onComplete(order);
    } catch (error) {
      const message = error?.message;
      setErrorMessage(typeof message === 'string' ? message : 'The demo order could not be completed. Please try again.');
      setFailOnce(false);
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Review checkoutToken={checkoutToken} headingRef={reviewHeadingRef} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Demo totals include an illustrative 8% tax on products and shipping.</Typography>
      <Divider />
      <Typography variant="h6" gutterBottom sx={{ mt: 2.5 }}>Simulated payment</Typography>
      <Typography variant="body2">No card details are needed. You will not be charged and no goods will be delivered.</Typography>
      <form onSubmit={handleSubmit} aria-busy={isSubmitting}>
        <FormControlLabel
          sx={{ my: 2 }}
          control={<Checkbox checked={failOnce} onChange={(event) => setFailOnce(event.target.checked)} disabled={isSubmitting} />}
          label="Simulate a payment failure"
        />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Try one failed payment, then retry with your cart and address intact.</Typography>
        {errorMessage && <Typography role="alert" color="error" sx={{ mb: 2 }}>{errorMessage}</Typography>}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={backStep} disabled={isSubmitting}>Back</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Placing demo order…' : `Place demo order — ${checkoutToken.live.total_with_tax.formatted_with_symbol}`}
          </Button>
        </Box>
      </form>
    </>
  );
}
