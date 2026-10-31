'use client';

import { Box, Typography, Button, Card, CardActions, CardContent, CardMedia } from '@mui/material';

import styles from './styles';

const CartItem = ({ item, onUpdateCartQty, onRemoveFromCart, isUpdating = false }) => (
  <Card>
    <CardMedia component="img" image={item.media.source} alt={item.name} sx={styles.media} />
    <CardContent sx={styles.cardContent}>
      <Typography variant="h4">{item.name}</Typography>
      <Typography variant="h5">{item.line_total.formatted_with_symbol}</Typography>
    </CardContent>
    <CardActions sx={styles.cardActions}>
      <Box sx={styles.buttons}>
        <Button type="button" size="small" aria-label={`Decrease ${item.name} quantity`} disabled={isUpdating} onClick={() => onUpdateCartQty(item.id, item.quantity - 1)}>-</Button>
        <Typography>{item.quantity}</Typography>
        <Button type="button" size="small" aria-label={`Increase ${item.name} quantity`} disabled={isUpdating} onClick={() => onUpdateCartQty(item.id, item.quantity + 1)}>+</Button>
      </Box>
      <Button variant="contained" type="button" color="secondary" disabled={isUpdating} onClick={() => onRemoveFromCart(item.id)}>Remove</Button>
    </CardActions>
  </Card>
);

export default CartItem;
