'use client';

import { useState, useEffect, useRef } from 'react';
import { Box, Paper, Stepper, Step, StepLabel, Typography, CircularProgress, Divider, Button } from '@mui/material';
import Link from 'next/link';

import { commerce } from '../../../lib/commerce';
import AddressForm from '../AddressForm';
import PaymentForm from '../PaymentForm';
import styles from './styles';

const steps = ['Shipping address', 'Payment details'];

const CheckoutSession = ({ cart, onCaptureCheckout, order, onComplete }) => {
  const [checkoutToken, setCheckoutToken] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [shippingData, setShippingData] = useState({});
  const [error, setError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [tokenAttempt, setTokenAttempt] = useState(0);
  const currentToken = useRef(null);
  const updating = useRef(false);

  useEffect(() => {
    if (!cart.id || order) return;
    let active = true;
    currentToken.current = null;
    updating.current = false;

    const generateToken = async () => {
      try {
        const token = await commerce.checkout.generateToken(cart.id, { type: 'cart' });
        if (!active) return;
        currentToken.current = token.id;
        setCheckoutToken(token);
      } catch {
        if (active) setError('Unable to start checkout. Please try again.');
      }
    };

    generateToken();
    return () => {
      active = false;
      currentToken.current = null;
    };
  }, [cart.id, order, tokenAttempt]);

  const submitShipping = async (data) => {
    if (updating.current) return;
    const tokenId = checkoutToken.id;
    updating.current = true;
    setIsUpdating(true);
    setError('');
    setShippingData(data);

    try {
      const location = { country: data.shippingCountry };
      if (data.shippingSubdivision) location.region = data.shippingSubdivision;
      const shipping = await commerce.checkout.checkShippingOption(tokenId, {
        shipping_option_id: data.shippingOption,
        ...location,
      });
      if (currentToken.current !== tokenId) return;
      if (!shipping.valid) throw new Error('This shipping option is no longer available. Please choose another option.');

      // Commerce.js updates the checkout when shipping and the tax zone are set.
      // Use its final totals rather than adding locally formatted prices.
      const tax = await commerce.checkout.setTaxZone(tokenId, {
        ...location,
        postal_zip_code: data.zip,
      });
      if (currentToken.current !== tokenId) return;
      if (!tax.valid || !tax.live?.shipping?.price || !tax.live?.total_with_tax) {
        throw new Error('Unable to calculate the order total. Please try again.');
      }
      setCheckoutToken((token) => ({ ...token, live: tax.live }));
      setActiveStep(1);
    } catch (error) {
      if (currentToken.current === tokenId) {
        const message = error?.data?.error?.message || error?.message;
        setError(typeof message === 'string' ? message : 'Unable to calculate the order total. Please try again.');
      }
    } finally {
      if (currentToken.current === tokenId) {
        updating.current = false;
        setIsUpdating(false);
      }
    }
  };

  const completeOrder = (confirmedOrder) => {
    onComplete(confirmedOrder);
    setActiveStep(steps.length);
  };

  return (
    <>
      <Box sx={styles.toolbar} />
      <Box component="main" sx={styles.layout}>
        <Paper sx={styles.paper}>
          <Typography component="h1" variant="h4" align="center">Checkout</Typography>
          <Stepper activeStep={activeStep} sx={styles.stepper}>
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>
          {order ? (
            <>
              <Typography variant="h5">Thank you for your purchase{order.customer?.firstname ? `, ${order.customer.firstname}` : ''}!</Typography>
              <Divider sx={styles.divider} />
              <Typography variant="subtitle2">Order ref: {order.customer_reference || order.id}</Typography>
              <br />
              <Button component={Link} variant="outlined" href="/">Back to home</Button>
            </>
          ) : checkoutToken ? (
            activeStep === 0 ? (
              <AddressForm checkoutToken={checkoutToken} shippingData={shippingData} onSubmit={submitShipping} isSubmitting={isUpdating} error={error} />
            ) : (
              <PaymentForm checkoutToken={checkoutToken} backStep={() => setActiveStep(0)} shippingData={shippingData} onCaptureCheckout={onCaptureCheckout} onComplete={completeOrder} />
            )
          ) : error ? (
            <>
              <Typography role="alert" color="error">{error}</Typography>
              <Button onClick={() => {
                setError('');
                setTokenAttempt((attempt) => attempt + 1);
              }}>Retry checkout</Button>
              <Button component={Link} href="/cart">Back to cart</Button>
            </>
          ) : (
            <Box sx={styles.spinner}><CircularProgress aria-label="Loading checkout" /></Box>
          )}
        </Paper>
      </Box>
    </>
  );
};

const Checkout = ({ cart, onCaptureCheckout }) => {
  const [order, setOrder] = useState(null);
  const [capturingCart, setCapturingCart] = useState(null);

  const captureCheckout = async (tokenId, orderData) => {
    // The provider may refresh the cart before capture resolves. Keep this
    // checkout session mounted until its order is confirmed or rejected.
    setCapturingCart(cart);
    try {
      return await onCaptureCheckout(tokenId, orderData);
    } catch (error) {
      setCapturingCart(null);
      throw error;
    }
  };

  const sessionCart = capturingCart || cart;
  return (
    <CheckoutSession
      key={sessionCart.id}
      cart={sessionCart}
      order={order}
      onCaptureCheckout={captureCheckout}
      onComplete={setOrder}
    />
  );
};

export default Checkout;
