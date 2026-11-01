'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { commerce } from '../lib/commerce';
import { usesSeededCatalog, usesSimulatedPayment, usesPersistentOrders, usesHostedStripe } from '../lib/storefront-config';
import { DEMO_CART_STORAGE_KEY } from '../lib/demo/storage-key';

const CommerceContext = createContext(null);

export function CommerceProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [productsStatus, setProductsStatus] = useState('loading');
  const [cartStatus, setCartStatus] = useState('loading');
  const [cartActionError, setCartActionError] = useState('');
  const [isUpdatingCart, setIsUpdatingCart] = useState(false);
  const changingCart = useRef(false);
  const productsRequest = useRef(null);
  const cartRequest = useRef(null);

  const loadProducts = useCallback(async () => {
    if (productsRequest.current) return;
    try {
      productsRequest.current = commerce.products.list();
      const { data } = await productsRequest.current;
      setProducts(data);
      setProductsStatus('ready');
    } catch {
      setProductsStatus('error');
    } finally {
      productsRequest.current = null;
    }
  }, []);

  const loadCart = useCallback(async () => {
    if (cartRequest.current) return;
    try {
      cartRequest.current = commerce.cart.retrieve();
      setCart(await cartRequest.current);
      setCartStatus('ready');
    } catch {
      setCartStatus('error');
    } finally {
      cartRequest.current = null;
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadCart();
  }, [loadProducts, loadCart]);

  useEffect(() => {
    if (!usesSeededCatalog) return;
    const syncCart = (event) => {
      if (event.key === DEMO_CART_STORAGE_KEY || event.key === null) loadCart();
    };
    // A completed demo purchase in another tab rotates the stored cart ID.
    // Refresh shared UI state so restarting checkout does not reuse an old ID.
    window.addEventListener('storage', syncCart);
    return () => window.removeEventListener('storage', syncCart);
  }, [loadCart]);

  const changeCart = async (operation) => {
    // Callers may confirm an update only after the provider returns a valid cart.
    // A suppressed duplicate is a separate outcome, not an implicit success.
    if (changingCart.current) return { status: 'busy' };
    changingCart.current = true;
    setIsUpdatingCart(true);
    setCartActionError('');
    try {
      const response = await operation();
      const updatedCart = response?.cart;
      if (typeof updatedCart?.id !== 'string' || !updatedCart.id
        || !Number.isSafeInteger(updatedCart.total_items) || updatedCart.total_items < 0) {
        throw new Error('The provider did not confirm the cart update.');
      }
      setCart(updatedCart);
      setCartStatus('ready');
      return { status: 'success', cart: updatedCart };
    } catch {
      setCartActionError('Your cart could not be updated. Please try again.');
      return { status: 'error' };
    } finally {
      changingCart.current = false;
      setIsUpdatingCart(false);
    }
  };

  const confirmOrder = useCallback((incomingOrder) => {
    if (typeof incomingOrder?.id !== 'string' || !incomingOrder.id.trim()) {
      throw new Error('We could not confirm your order. Please contact the store before trying again.');
    }
    const paymentConfirmed = usesSimulatedPayment
      ? incomingOrder.demo === true && (usesPersistentOrders
        ? incomingOrder.persistent === true && incomingOrder.status_payment === 'simulated'
        : incomingOrder.status_payment === 'paid')
      : usesHostedStripe
        ? incomingOrder.demo === false && incomingOrder.persistent === true && incomingOrder.payment_provider === 'stripe-test'
          && incomingOrder.payment_mode === 'test' && incomingOrder.status_payment === 'paid'
        : !incomingOrder.demo && ['paid', 'authorized'].includes(incomingOrder.status_payment);
    if (!paymentConfirmed) {
      throw new Error('Your order payment has not been confirmed. Please contact the store before trying again.');
    }

    // Cart synchronization must not turn a confirmed purchase into a payment failure.
    if (usesPersistentOrders) {
      if (incomingOrder.cart) setCart(incomingOrder.cart);
    } else setCart({ line_items: [], total_items: 0 });
    commerce.cart.refresh().then(setCart).catch(() => {});
    return incomingOrder;
  }, []);
  const handleCaptureCheckout = async (checkoutTokenId, newOrder) => confirmOrder(await commerce.checkout.capture(checkoutTokenId, newOrder));
  const handleRecoverCheckout = async () => confirmOrder(await commerce.checkout.recover());
  // Creating or resuming a hosted session is not payment confirmation.
  const handleStartPayment = (tokenId) => commerce.checkout.startPayment(tokenId);
  const handleResumePayment = () => commerce.checkout.recover();
  const handleCompletePayment = useCallback(async (order) => confirmOrder(await commerce.checkout.completePayment(order)), [confirmOrder]);
  const handleCanceledPayment = useCallback((order) => commerce.checkout.releaseCanceledPayment(order), []);

  return (
    <CommerceContext.Provider value={{
      products, cart, productsStatus, cartStatus, cartActionError, isUpdatingCart,
      loadProducts: () => { setProductsStatus('loading'); return loadProducts(); },
      loadCart: () => { setCartStatus('loading'); return loadCart(); },
      handleAddToCart: (id, quantity) => changeCart(() => commerce.cart.add(id, quantity)),
      handleUpdateCartQty: (id, quantity) => changeCart(() => commerce.cart.update(id, { quantity })),
      handleRemoveFromCart: (id) => changeCart(() => commerce.cart.remove(id)),
      handleEmptyCart: () => changeCart(() => commerce.cart.empty()),
      handleCaptureCheckout, handleRecoverCheckout, handleStartPayment, handleResumePayment, handleCompletePayment, handleCanceledPayment,
    }}>
      {children}
    </CommerceContext.Provider>
  );
}

export function useCommerce() {
  const context = useContext(CommerceContext);
  if (!context) throw new Error('useCommerce requires CommerceProvider');
  return context;
}
