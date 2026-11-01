'use client';

import Checkout from '../../components/CheckoutForm/Checkout/Checkout';
import StoreStatus from '../../components/StoreStatus';
import { useCommerce } from '../../context/CommerceContext';

export default function CheckoutPage() {
  const { cart, cartStatus, loadCart, handleCaptureCheckout, handleRecoverCheckout, handleStartPayment, handleResumePayment, handleCompletePayment } = useCommerce();
  if (cartStatus !== 'ready') return <StoreStatus title="Checkout" status={cartStatus} message="Your cart is temporarily unavailable. Please try again." onRetry={loadCart} />;
  return <Checkout cart={cart} onCaptureCheckout={handleCaptureCheckout} onRecoverCheckout={handleRecoverCheckout}
    onStartPayment={handleStartPayment} onResumePayment={handleResumePayment} onCompletePayment={handleCompletePayment} />;
}
