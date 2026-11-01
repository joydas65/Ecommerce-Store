'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, Container, Divider, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { isOrderReceipt } from '../../lib/orders/order-contract';

const currency = (cents) => `$${(cents / 100).toFixed(2)}`;
const dateLabel = (iso) => `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso))} UTC`;
const shippingLabels = { 'demo-standard': 'Standard shipping', 'demo-express': 'Express shipping' };

export default function OrderReceipt({ orderId }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestKey = `${orderId}:${attempt}`;
  const current = result?.key === requestKey ? result : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadOrder() {
      try {
        const response = await fetch(`/api/demo/orders/${encodeURIComponent(orderId)}`, {
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
        const order = await response.json();
        if (!isOrderReceipt(order, orderId)) throw new Error('Order response could not be verified.');
        if (active) setResult({ key: requestKey, status: 'ready', order });
      } catch {
        if (active) setResult({ key: requestKey, status: 'error' });
      }
    }

    loadOrder();
    return () => { active = false; controller.abort(); };
  }, [orderId, requestKey]);

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
            <Typography color="text.secondary">This receipt is unavailable. Open it in the browser used to place the demo order, or start a new demo purchase.</Typography>
          </>
        ) : current.status === 'error' ? (
          <>
            <Typography component="h1" variant="h4" gutterBottom>Order unavailable</Typography>
            <Alert severity="error" sx={{ mb: 2 }}>We could not load a confirmed receipt. Please try again.</Alert>
            <Button variant="contained" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>
          </>
        ) : (
          <>
            <Typography variant="overline" color="text.secondary">Saved demo receipt</Typography>
            <Typography component="h1" variant="h4" gutterBottom>Demo order complete</Typography>
            <Alert severity="success" sx={{ my: 2 }}>This was a simulated purchase. No payment was collected and nothing will be shipped.</Alert>
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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>This saved receipt is available until {dateLabel(current.order.expiresAt)} in this browser.</Typography>
          </>
        )}
        <Box sx={{ mt: 3 }}><Button component={Link} href="/" variant="outlined">Back to store</Button></Box>
      </Paper>
    </Container>
  );
}
