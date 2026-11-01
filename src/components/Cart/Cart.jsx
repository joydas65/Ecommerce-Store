'use client';

import { Box, Container, Typography, Button, Grid, Link as MuiLink } from '@mui/material';
import Link from 'next/link';

import CartItem from './CartItem/CartItem';
import styles from './styles';

const Cart = ({ cart, handleUpdateCartQty, handleRemoveFromCart, handleEmptyCart, isUpdating = false }) => (
  <Container component="main">
    <Typography sx={styles.title} variant="h3" gutterBottom>Your Shopping Cart</Typography>
    {!cart.line_items ? (
      <Typography role="status">Loading cart…</Typography>
    ) : !cart.line_items.length ? (
      <Typography variant="subtitle1">
        You have no items in your shopping cart,{' '}
        <MuiLink component={Link} href="/" underline="hover">start adding some!</MuiLink>
      </Typography>
    ) : (
      <>
        <Grid container spacing={3}>
          {cart.line_items.map((item) => (
            <Grid size={{ xs: 12, sm: 4 }} key={item.id}>
              <CartItem item={item} onUpdateCartQty={handleUpdateCartQty} onRemoveFromCart={handleRemoveFromCart} isUpdating={isUpdating} />
            </Grid>
          ))}
        </Grid>
        <Box sx={styles.cardDetails}>
          <Typography variant="h4">Subtotal: {cart.subtotal.formatted_with_symbol}</Typography>
          <Box sx={styles.actions}>
            <Button sx={styles.actionButton} size="large" type="button" variant="contained" color="secondary" disabled={isUpdating} onClick={handleEmptyCart}>Empty Cart</Button>
            <Button component={Link} href="/checkout" sx={styles.actionButton} size="large" variant="contained" color="primary" disabled={isUpdating}>Checkout</Button>
          </Box>
        </Box>
      </>
    )}
  </Container>
);

export default Cart;
