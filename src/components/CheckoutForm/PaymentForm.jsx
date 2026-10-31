'use client';

import { useRef, useState } from 'react';
import { Typography, Button, Divider } from '@mui/material';
import { Elements, CardElement, ElementsConsumer } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';

import Review from './Review';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

const PaymentForm = ({ checkoutToken, backStep, shippingData, onCaptureCheckout, onComplete }) => {
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

      const orderData = {
        line_items: checkoutToken.live.line_items,
        customer: { firstname: shippingData.firstName, lastname: shippingData.lastName, email: shippingData.email },
        shipping: { name: `${shippingData.firstName} ${shippingData.lastName}`, street: shippingData.address1, town_city: shippingData.city, county_state: shippingData.shippingSubdivision, postal_zip_code: shippingData.zip, country: shippingData.shippingCountry },
        fulfillment: { shipping_method: shippingData.shippingOption },
        payment: {
          gateway: 'stripe',
          stripe: {
            payment_method_id: paymentMethod.id,
          },
        },
      };

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
      <Review checkoutToken={checkoutToken} />
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
export default PaymentForm;
