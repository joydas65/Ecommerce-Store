import React, { useState, useEffect, useRef } from 'react';
import { CssBaseline, Paper, Stepper, Step, StepLabel, Typography, CircularProgress, Divider, Button } from '@material-ui/core';
import { Link } from 'react-router-dom';

import { commerce } from '../../../lib/commerce';
import AddressForm from '../AddressForm';
import PaymentForm from '../PaymentForm';
import useStyles from './styles';

const steps = ['Shipping address', 'Payment details'];

const Checkout = ({ cart, onCaptureCheckout }) => {
  const [checkoutToken, setCheckoutToken] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [shippingData, setShippingData] = useState({});
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [tokenAttempt, setTokenAttempt] = useState(0);
  const currentToken = useRef(null);
  const updating = useRef(false);
  const classes = useStyles();

  useEffect(() => {
    if (!cart.id || order) return;
    let active = true;
    currentToken.current = null;
    updating.current = false;
    setCheckoutToken(null);
    setActiveStep(0);
    setShippingData({});
    setError('');
    setIsUpdating(false);

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

      // Commerce.js 2.2 updates the checkout when shipping and the tax zone are set.
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
    setOrder(confirmedOrder);
    setActiveStep(steps.length);
  };

  return (
    <>
      <CssBaseline />
      <div className={classes.toolbar} />
      <main className={classes.layout}>
        <Paper className={classes.paper}>
          <Typography variant="h4" align="center">Checkout</Typography>
          <Stepper activeStep={activeStep} className={classes.stepper}>
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>
          {order ? (
            <>
              <Typography variant="h5">Thank you for your purchase{order.customer?.firstname ? `, ${order.customer.firstname}` : ''}!</Typography>
              <Divider className={classes.divider} />
              <Typography variant="subtitle2">Order ref: {order.customer_reference || order.id}</Typography>
              <br />
              <Button component={Link} variant="outlined" to="/">Back to home</Button>
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
              <Button onClick={() => setTokenAttempt((attempt) => attempt + 1)}>Retry checkout</Button>
              <Button component={Link} to="/cart">Back to cart</Button>
            </>
          ) : (
            <div className={classes.spinner}><CircularProgress aria-label="Loading checkout" /></div>
          )}
        </Paper>
      </main>
    </>
  );
};

export default Checkout;
