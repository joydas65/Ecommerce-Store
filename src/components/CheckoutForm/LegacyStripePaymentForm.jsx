'use client';

import { useRef, useState } from 'react';
import { Typography, Button, Divider } from '@mui/material';
import { Elements, CardElement, ElementsConsumer } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';

import Review from './Review';
import { createOrderData } from './orderData';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

const LegacyStripePaymentForm = ({ checkoutToken, backStep, shippingData, onCaptureCheckout, onComplete, reviewHeadingRef }) => {
  // Initialize Stripe only when this payment adapter is actually rendered.
  const [stripePromise] = useState(() => publishableKey ? loadStripe(publishableKey) : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const submitting = useRef(false);

  const handleSubmit = async (event, elements, stripe) => {
    event.preventDefault();

    if (!stripePromise || !stripe || !elements || submitting.current) return;

    submitting.current = true;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Payment form is not ready. Please try again.');

      const { error, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card: cardElement });
      if (error) throw error;
      if (!paymentMethod || !paymentMethod.id) throw new Error('Unable to prepare your payment. Please try again.');

      const orderData = createOrderData(checkoutToken, shippingData, {
        gateway: 'stripe',
        stripe: {
          payment_method_id: paymentMethod.id,
        },
      });

      const order = await onCaptureCheckout(checkoutToken.id, orderData);
      onComplete(order);
    } catch (error) {
      const message = error?.data?.error?.message || error?.message;
      setErrorMessage(typeof message === 'string' ? message : 'Unable to complete your order. Please try again.');
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Review checkoutToken={checkoutToken} headingRef={reviewHeadingRef} />
      <Divider />
      <Typography variant="h6" gutterBottom sx={{ my: 2.5 }}>Payment method</Typography>
      {!stripePromise && (
        <Typography color="error" role="alert">Payments are temporarily unavailable. Please try again later.</Typography>
      )}
      <Elements stripe={stripePromise}>
        <ElementsConsumer>{({ elements, stripe }) => (
          <form onSubmit={(e) => handleSubmit(e, elements, stripe)} aria-busy={isSubmitting}>
            <CardElement options={{ disabled: isSubmitting }} />
            {errorMessage && <Typography color="error" role="alert">{errorMessage}</Typography>}
            <br /> <br />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="outlined" onClick={backStep} disabled={isSubmitting}>Back</Button>
              <Button type="submit" variant="contained" disabled={!stripePromise || !stripe || !elements || isSubmitting} color="primary">
                {isSubmitting ? 'Processing payment…' : `Pay ${checkoutToken.live.total_with_tax.formatted_with_symbol}`}
              </Button>
            </div>
          </form>
        )}
        </ElementsConsumer>
      </Elements>
    </>
  );
};

export default LegacyStripePaymentForm;
