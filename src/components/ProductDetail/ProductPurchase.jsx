'use client';

import { Alert, Button, CircularProgress } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useCommerce } from '../../context/CommerceContext';
import useAddToCart from '../../hooks/useAddToCart';
import CartConfirmation from '../CartFeedback/CartConfirmation';

export default function ProductPurchase({ product }) {
  const { handleAddToCart, isUpdatingCart } = useCommerce();
  const { addProduct, addingId, added, unexpectedError, dismiss } = useAddToCart(handleAddToCart, isUpdatingCart);
  const isAdding = addingId === product.id;

  return (
    <div>
      {unexpectedError && <Alert severity="error" sx={{ mb: 2 }}>{unexpectedError}</Alert>}
      <Button fullWidth variant="contained" size="large" sx={{ minHeight: 54 }}
        aria-label={`${isAdding ? 'Adding…' : 'Add to cart:'} ${product.name}`} aria-busy={isAdding}
        disabled={isUpdatingCart || addingId !== null}
        onClick={(event) => addProduct(product, event.currentTarget)}
        startIcon={isAdding ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : <Add />}>
        {isAdding ? 'Adding…' : 'Add to cart'}
      </Button>
      <noscript><p>Enable JavaScript to add products to your cart and check out.</p></noscript>
      <CartConfirmation added={added} onDismiss={dismiss} />
    </div>
  );
}
