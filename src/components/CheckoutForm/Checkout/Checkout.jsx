'use client';

import { useState, useEffect, useRef } from 'react';
import { Box, Paper, Stepper, Step, StepLabel, Typography, CircularProgress, Divider, Button } from '@mui/material';
import Link from 'next/link';

import { commerce } from '../../../lib/commerce';
import AddressForm from '../AddressForm';
import PaymentForm from '../PaymentForm';
import styles from './styles';
import { isDemoMode, isPersistentDemo } from '../../../lib/commerce-mode';

const steps = ['Shipping address', isDemoMode ? 'Simulated payment' : 'Payment details'];

const readPendingCheckout = async () => {
  try { return await commerce.checkout.pending(); }
  catch {
    return { unreadable: true, message: 'We could not check your previous checkout. Retry the recovery check before placing another order.' };
  }
};

const CheckoutSession = ({ cart, onCaptureCheckout, order, onComplete, notice = '' }) => {
  const [checkoutToken, setCheckoutToken] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [shippingData, setShippingData] = useState({});
  const [error, setError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [tokenAttempt, setTokenAttempt] = useState(0);
  const currentToken = useRef(null);
  const updating = useRef(false);
  const reviewHeading = useRef(null);
  const confirmationHeading = useRef(null);
  const isEmpty = Array.isArray(cart.line_items) && cart.line_items.length === 0;

  useEffect(() => {
    const heading = order ? confirmationHeading.current : activeStep === 1 ? reviewHeading.current : null;
    if (!heading) return;
    heading.focus();
    heading.scrollIntoView?.({ block: 'start' });
  }, [activeStep, order]);

  useEffect(() => {
    if (!cart.id || order || isEmpty) return;
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
  }, [cart.id, order, tokenAttempt, isEmpty]);

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
      <Box component="main" sx={styles.layout}>
        <Paper sx={styles.paper}>
          <Typography component="h1" variant="h4" align="center">Checkout</Typography>
          <Stepper activeStep={activeStep} sx={styles.stepper}>
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>
          {!order && notice && <Typography role="alert" sx={{ mb: 2 }}>{notice}</Typography>}
          {order ? (
            <>
              <Typography component="h2" variant="h5" ref={confirmationHeading} tabIndex={-1} sx={{ scrollMarginTop: 96 }}>{order.demo ? 'Demo order complete' : `Thank you for your purchase${order.customer?.firstname ? `, ${order.customer.firstname}` : ''}!`}</Typography>
              {order.demo && <Typography sx={{ mt: 1 }}>This was a simulated purchase. No payment was taken and no goods will be delivered.</Typography>}
              <Divider sx={styles.divider} />
              <Typography variant="subtitle2">Order ref: {order.customer_reference || order.id}</Typography>
              <br />
              {order.persistent && <Button component={Link} variant="contained" href={order.receipt_url} sx={{ mr: 2, mb: 2 }}>View saved receipt</Button>}
              <Button component={Link} variant="outlined" href="/">Back to home</Button>
            </>
          ) : isEmpty ? (
            <>
              <Typography sx={{ mb: 2 }}>Your cart is empty. Add a product to start checkout.</Typography>
              <Button component={Link} href="/" variant="contained">Browse products</Button>
            </>
          ) : checkoutToken ? (
            activeStep === 0 ? (
              <AddressForm checkoutToken={checkoutToken} shippingData={shippingData} onSubmit={submitShipping} isSubmitting={isUpdating} error={error} />
            ) : (
              <PaymentForm checkoutToken={checkoutToken} backStep={() => setActiveStep(0)} shippingData={shippingData} onCaptureCheckout={onCaptureCheckout} onComplete={completeOrder} reviewHeadingRef={reviewHeading} />
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

const Checkout = ({ cart, onCaptureCheckout, onRecoverCheckout }) => {
  const [order, setOrder] = useState(null);
  const [capturingCart, setCapturingCart] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(isPersistentDemo ? 'loading' : 'ready');
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const recoveryLock = useRef(false);

  useEffect(() => {
    if (!isPersistentDemo) return;
    let active = true;
    readPendingCheckout().then((attempt) => {
      if (active) { setPending(attempt); setPendingStatus('ready'); }
    });
    return () => { active = false; };
  }, []);

  const retryPendingCheck = async () => {
    setPendingStatus('loading');
    const attempt = await readPendingCheckout();
    setPending(attempt);
    setPendingStatus('ready');
  };

  const recover = async () => {
    if (recoveryLock.current) return;
    recoveryLock.current = true;
    setRecovering(true);
    setRecoveryError('');
    setCapturingCart(cart);
    try {
      const recovered = await onRecoverCheckout();
      setOrder(recovered);
      setPending(null);
    } catch (error) {
      const message = error?.message || 'Your order could not be recovered. Please try again.';
      const attempt = await readPendingCheckout();
      setPending(attempt);
      setRecoveryError(message);
      if (!attempt) setRecoveryNotice(`${message} Review your shipping details below before starting a new checkout.`);
      setCapturingCart(null);
    } finally {
      recoveryLock.current = false;
      setRecovering(false);
    }
  };

  const captureCheckout = async (tokenId, orderData) => {
    // The provider may refresh the cart before capture resolves. Keep this
    // checkout session mounted until its order is confirmed or rejected.
    setCapturingCart(cart);
    setRecoveryNotice('');
    try {
      return await onCaptureCheckout(tokenId, orderData);
    } catch (error) {
      if (isPersistentDemo) setPending(await readPendingCheckout());
      setCapturingCart(null);
      throw error;
    }
  };

  const sessionCart = capturingCart || cart;
  if (pendingStatus === 'loading' && !order) return (
    <Box component="main" sx={styles.layout}>
      <Paper sx={styles.paper}>
        <Typography component="h1" variant="h4" gutterBottom>Checkout</Typography>
        <CircularProgress aria-label="Checking previous checkout" />
      </Paper>
    </Box>
  );
  if (pending && !order) return (
    <Box component="main" sx={styles.layout}>
      <Paper sx={styles.paper}>
        <Typography component="h1" variant="h4">Recover your demo order</Typography>
        <Typography sx={{ my: 2 }}>A previous checkout is awaiting confirmation. Recover that attempt before starting another purchase; it may already be saved.</Typography>
        {pending.unreadable && <Typography role="alert" color="error">{pending.message}</Typography>}
        {recoveryError && <Typography role="alert" color="error" sx={{ my: 2 }}>{recoveryError}</Typography>}
        <Button variant="contained" onClick={recover} disabled={recovering || pending.unreadable} aria-busy={recovering}>{recovering ? 'Recovering order…' : 'Recover pending order'}</Button>
        {pending.unreadable && <Button onClick={retryPendingCheck} sx={{ ml: 2 }}>Retry recovery check</Button>}
        <Button component={Link} href="/cart" sx={{ ml: 2 }}>Back to cart</Button>
      </Paper>
    </Box>
  );
  return (
    <CheckoutSession
      key={sessionCart.id}
      cart={sessionCart}
      order={order}
      onCaptureCheckout={captureCheckout}
      onComplete={setOrder}
      notice={recoveryNotice}
    />
  );
};

export default Checkout;
