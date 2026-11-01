'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { commerce } from '../lib/commerce';
import { isDemoMode } from '../lib/commerce-mode';
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
    if (!isDemoMode) return;
    const syncCart = (event) => {
      if (event.key === DEMO_CART_STORAGE_KEY || event.key === null) loadCart();
    };
    // A completed demo purchase in another tab rotates the stored cart ID.
    // Refresh shared UI state so restarting checkout does not reuse an old ID.
    window.addEventListener('storage', syncCart);
    return () => window.removeEventListener('storage', syncCart);
  }, [loadCart]);

  const changeCart = async (operation) => {
    if (changingCart.current) return;
    changingCart.current = true;
    setIsUpdatingCart(true);
    setCartActionError('');
    try {
      const response = await operation();
      setCart(response.cart);
      setCartStatus('ready');
    } catch {
      setCartActionError('Your cart could not be updated. Please try again.');
    } finally {
      changingCart.current = false;
      setIsUpdatingCart(false);
    }
  };

  const handleCaptureCheckout = async (checkoutTokenId, newOrder) => {
    const incomingOrder = await commerce.checkout.capture(checkoutTokenId, newOrder);
    if (!incomingOrder?.id) {
      throw new Error('We could not confirm your order. Please contact the store before trying again.');
    }
    if (incomingOrder.status_payment && !['paid', 'authorized'].includes(incomingOrder.status_payment)) {
      throw new Error('Your order payment has not been confirmed. Please contact the store before trying again.');
    }

    // Cart synchronization must not turn a confirmed purchase into a payment failure.
    setCart({ line_items: [], total_items: 0 });
    commerce.cart.refresh().then(setCart).catch(() => {});
    return incomingOrder;
  };

  return (
    <CommerceContext.Provider value={{
      products, cart, productsStatus, cartStatus, cartActionError, isUpdatingCart,
      loadProducts: () => { setProductsStatus('loading'); return loadProducts(); },
      loadCart: () => { setCartStatus('loading'); return loadCart(); },
      handleAddToCart: (id, quantity) => changeCart(() => commerce.cart.add(id, quantity)),
      handleUpdateCartQty: (id, quantity) => changeCart(() => commerce.cart.update(id, { quantity })),
      handleRemoveFromCart: (id) => changeCart(() => commerce.cart.remove(id)),
      handleEmptyCart: () => changeCart(() => commerce.cart.empty()),
      handleCaptureCheckout,
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
