'use client';

import { Box, Typography } from '@mui/material';
import Products from '../components/Products/Products';
import StoreStatus from '../components/StoreStatus';
import { useCommerce } from '../context/CommerceContext';

export default function CatalogPage() {
  const { products, productsStatus, loadProducts, handleAddToCart, isUpdatingCart } = useCommerce();
  if (productsStatus !== 'ready') return <StoreStatus title="Products" status={productsStatus} message="The store is temporarily unavailable. Please try again later." onRetry={loadProducts} />;
  if (!products.length) return <Box component="main" sx={{ py: 3, px: 3 }}><Typography component="h1" variant="h4">Products</Typography><Typography>New products are on their way. Please check back soon.</Typography></Box>;
  return <Products products={products} onAddToCart={handleAddToCart} isUpdating={isUpdatingCart} />;
}
