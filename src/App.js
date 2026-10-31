import React, { useState, useEffect } from 'react';
import { CssBaseline } from '@material-ui/core';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';

import { Navbar, Products, Cart, Checkout } from './components';
import { commerce } from './lib/commerce';

const App = () => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});

  const fetchProducts = async () => {
    const { data } = await commerce.products.list();

    setProducts(data);
  };

  const fetchCart = async () => {
    setCart(await commerce.cart.retrieve());
  };

  const handleAddToCart = async (productId, quantity) => {
    const item = await commerce.cart.add(productId, quantity);

    setCart(item.cart);
  };

  const handleUpdateCartQty = async (lineItemId, quantity) => {
    const response = await commerce.cart.update(lineItemId, { quantity });

    setCart(response.cart);
  };

  const handleRemoveFromCart = async (lineItemId) => {
    const response = await commerce.cart.remove(lineItemId);

    setCart(response.cart);
  };

  const handleEmptyCart = async () => {
    const response = await commerce.cart.empty();

    setCart(response.cart);
  };

  const refreshCart = async () => {
    const newCart = await commerce.cart.refresh();

    setCart(newCart);
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
    refreshCart().catch(() => {});
    return incomingOrder;
  };

  useEffect(() => {
    fetchProducts();
    fetchCart();
  }, []);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  return (
    <Router>
      <div style={{ display: 'flex' }}>
        <CssBaseline />
        <Navbar totalItems={cart.total_items} handleDrawerToggle={handleDrawerToggle} />
        <Switch>
          <Route exact path="/">
            <Products products={products} onAddToCart={handleAddToCart} handleUpdateCartQty />
          </Route>
          <Route exact path="/cart">
            <Cart cart={cart} handleUpdateCartQty={handleUpdateCartQty} handleRemoveFromCart={handleRemoveFromCart} handleEmptyCart={handleEmptyCart} />
          </Route>
          <Route path="/checkout" exact>
            <Checkout cart={cart} onCaptureCheckout={handleCaptureCheckout} />
          </Route>
        </Switch>
      </div>
    </Router>
  );
};

export default App;
