'use client';

import Cart from '../../components/Cart/Cart';
import StoreStatus from '../../components/StoreStatus';
import { useCommerce } from '../../context/CommerceContext';

export default function CartPage() {
  const { cart, cartStatus, loadCart, handleUpdateCartQty, handleRemoveFromCart, handleEmptyCart, isUpdatingCart } = useCommerce();
  if (cartStatus !== 'ready') return <StoreStatus title="Your cart" status={cartStatus} message="Your cart is temporarily unavailable. Please try again." onRetry={loadCart} />;
  return <Cart cart={cart} handleUpdateCartQty={handleUpdateCartQty} handleRemoveFromCart={handleRemoveFromCart} handleEmptyCart={handleEmptyCart} isUpdating={isUpdatingCart} />;
}
