'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Container, Divider, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { isOrderReceipt, isPaidStripeOrder, isStripeOrder, isStripeSessionResult } from '../../lib/orders/order-contract';
import { usesHostedStripe } from '../../lib/storefront-config';
import { useCommerce } from '../../context/CommerceContext';

const currency = (cents) => `$${(cents / 100).toFixed(2)}`;
const dateLabel = (iso) => `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso))} UTC`;
const shippingLabels = { 'demo-standard': 'Standard shipping', 'demo-express': 'Express shipping' };

export default function OrderReceipt({ orderId }) {
  const { handleCompletePayment, handleCanceledPayment } = useCommerce();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [actionPending, setActionPending] = useState(false);
  const actionLock = useRef(false);
  const activeController = useRef(null);
  const requestKey = `${orderId}:${attempt}`;
  const current = result?.key === requestKey ? result : { status: 'loading' };
  const order = current.order;
  const stripeOrder = isStripeOrder(order);
  const paidStripe = isPaidStripeOrder(order);
  const pendingStripe = stripeOrder && order.status === 'PENDING_PAYMENT';
  const canceledStripe = stripeOrder && order.status === 'CANCELED';
  const reviewStripe = stripeOrder && order.status === 'PAYMENT_REVIEW';

  const synchronizeCart = useCallback(async (saved) => {
    if (!usesHostedStripe || !isStripeOrder(saved)) return '';
    try {
      if (isPaidStripeOrder(saved)) await handleCompletePayment(saved);
      else if (saved.status === 'CANCELED') await handleCanceledPayment(saved);
      return '';
    } catch {
      return 'The saved payment status is shown below, but this browser could not update its checkout. Return to checkout to recover the saved attempt.';
    }
  }, [handleCompletePayment, handleCanceledPayment]);

  const requestState = useCallback(async (action, signal) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/${action}`, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: '{}', signal,
    });
    if (!response.ok) throw new Error('Payment status is temporarily unavailable. Your cart is unchanged. Try checking again.');
    const value = await response.json();
    if (!isStripeSessionResult(value, orderId)) throw new Error('The payment status could not be verified. Your cart is unchanged.');
    return value;
  }, [orderId]);

  useEffect(() => {
    const controller = new AbortController();
    activeController.current = controller;
    let active = true;

    async function loadOrder() {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 404) {
          setResult({ key: requestKey, status: 'missing' });
          return;
        }
        if (!response.ok) throw new Error('Order request failed.');
        let order = await response.json();
        if (!isOrderReceipt(order, orderId) && !isStripeOrder(order, orderId)) throw new Error('Order response could not be verified.');
        let checkoutUrl = null;
        let error = '';
        // A redirect parameter is never proof of payment or cancellation. Ask
        // the server once; subsequent checks are explicit user actions.
        if (isStripeOrder(order) && order.status === 'PENDING_PAYMENT') {
          try {
            const reconciled = await requestState('reconcile', controller.signal);
            order = reconciled.order;
            checkoutUrl = reconciled.checkoutUrl;
          } catch {
            error = 'Payment status is temporarily unavailable. Your cart is unchanged. Try checking again.';
          }
        }
        if (!active) return;
        const warning = await synchronizeCart(order);
        if (active) setResult({ key: requestKey, status: 'ready', order, checkoutUrl, warning, error });
      } catch {
        if (active) setResult({ key: requestKey, status: 'error' });
      }
    }

    loadOrder();
    return () => { active = false; controller.abort(); };
  }, [orderId, requestKey, requestState, synchronizeCart]);

  const updatePayment = async (action) => {
    if (actionLock.current || !activeController.current) return;
    const signal = activeController.current.signal;
    actionLock.current = true;
    setActionPending(true);
    try {
      const value = await requestState(action, signal);
      if (signal.aborted) return;
      const warning = await synchronizeCart(value.order);
      if (!signal.aborted) setResult({ key: requestKey, status: 'ready', ...value, warning, error: '' });
    } catch (error) {
      if (!signal.aborted) setResult((previous) => ({ ...previous, error: error?.message || 'Payment status could not be checked. Try again.' }));
    } finally {
      actionLock.current = false;
      setActionPending(false);
    }
  };

  return (
    <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
        {current.status === 'loading' ? (
          <>
            <Typography component="h1" variant="h4" gutterBottom>Loading order</Typography>
            <CircularProgress aria-label="Loading saved order" size={28} />
          </>
        ) : current.status === 'missing' ? (
          <>
            <Typography component="h1" variant="h4" gutterBottom>Order not found</Typography>
            <Typography color="text.secondary">This receipt is unavailable. Open it in the browser used to place the order.</Typography>
          </>
        ) : current.status === 'error' ? (
          <>
            <Typography component="h1" variant="h4" gutterBottom>Order unavailable</Typography>
            <Alert severity="error" sx={{ mb: 2 }}>We could not load a confirmed receipt. Please try again.</Alert>
            <Button variant="contained" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>
          </>
        ) : (
          <>
            <Typography variant="overline" color="text.secondary">{stripeOrder ? 'Stripe test checkout' : 'Saved demo receipt'}</Typography>
            <Typography component="h1" variant="h4" gutterBottom>{paidStripe ? 'Stripe test order complete' : pendingStripe ? 'Payment awaiting confirmation' : canceledStripe ? 'Checkout canceled' : reviewStripe ? 'Payment needs review' : 'Demo order complete'}</Typography>
            {paidStripe ? <Alert severity="success" sx={{ my: 2 }}>Stripe verified this test payment. No real money was charged and nothing will be shipped.</Alert>
              : pendingStripe ? <Alert severity="info" sx={{ my: 2 }}>Payment has not been confirmed. Resume the same Stripe test checkout or check its status. Your cart is unchanged.</Alert>
                : canceledStripe ? <Alert severity="info" sx={{ my: 2 }}>This Stripe test checkout is canceled. Your cart is unchanged.</Alert>
                  : reviewStripe ? <Alert severity="warning" sx={{ my: 2 }}>Payment could not be verified and needs review. Your cart is unchanged. Do not start another payment.</Alert>
                    : <Alert severity="success" sx={{ my: 2 }}>This was a simulated purchase. No payment was collected and nothing will be shipped.</Alert>}
            {current.warning && <Alert severity="warning" sx={{ mb: 2 }}>{current.warning}</Alert>}
            {current.error && <Alert severity="error" sx={{ mb: 2 }}>{current.error}</Alert>}
            {(pendingStripe || reviewStripe) && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
              <Button variant="outlined" disabled={actionPending} onClick={() => updatePayment('reconcile')}>Check payment status</Button>
              {pendingStripe && current.checkoutUrl && <Button variant="contained" disabled={actionPending} onClick={() => window.location.assign(current.checkoutUrl)}>Resume Stripe checkout</Button>}
              {pendingStripe && <Button color="inherit" disabled={actionPending} onClick={() => updatePayment('cancel')}>Cancel checkout</Button>}
            </Box>}
            {canceledStripe && <Button component={Link} href="/checkout" variant="contained" sx={{ mb: 3 }}>Return to checkout</Button>}
            <Typography sx={{ overflowWrap: 'anywhere' }}>Order ref: {current.order.reference}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Placed {dateLabel(current.order.createdAt)}</Typography>
            <Divider sx={{ my: 3 }} />
            <Typography component="h2" variant="h6">Order summary</Typography>
            <List disablePadding aria-label="Order items">
              {current.order.items.map((item) => (
                <ListItem key={item.productId} disableGutters sx={{ gap: 2, alignItems: 'flex-start' }}>
                  <ListItemText primary={item.name} secondary={`Quantity: ${item.quantity} · ${currency(item.unitPriceCents)} each`} />
                  <Typography sx={{ pt: 1, whiteSpace: 'nowrap' }}>{currency(item.lineTotalCents)}</Typography>
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 1.5 }} />
            <List disablePadding aria-label="Order totals">
              {[
                ['Subtotal', current.order.subtotalCents],
                [shippingLabels[current.order.shippingMethod], current.order.shippingCents],
                ['Sample tax (8%)', current.order.taxCents],
                ['Total', current.order.totalCents],
              ].map(([label, amount]) => (
                <ListItem key={label} disableGutters sx={{ gap: 2, py: 0.5 }}>
                  <ListItemText primary={label} />
                  <Typography sx={{ fontWeight: label === 'Total' ? 700 : 400 }}>{currency(amount)}</Typography>
                </ListItem>
              ))}
            </List>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>{pendingStripe || reviewStripe
              ? 'This payment status remains available in this browser while the payment is unresolved.'
              : `This saved receipt is available until ${dateLabel(current.order.expiresAt)} in this browser.`}</Typography>
          </>
        )}
        <Box sx={{ mt: 3 }}><Button component={Link} href="/" variant="outlined">Back to store</Button></Box>
      </Paper>
    </Container>
  );
}
